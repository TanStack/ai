import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  generateAudio,
  generateImage,
  generateTranscription,
} from '@tanstack/ai'
import { composePersistence, defineAIPersistence } from '../src/types'
import { memoryPersistence } from '../src/memory'
import { withGenerationPersistence } from '../src/middleware'
import { retrieveArtifact, retrieveBlob } from '../src/retrieve'
import type {
  GenerationArtifactDescriptor,
  GenerationArtifactExtractionInput,
  GenerationArtifactNameInput,
  AIPersistence,
} from '../src'
import type {
  AudioAdapter,
  AudioGenerationResult,
  ImageAdapter,
  PersistedArtifactRef,
  StreamChunk,
  TranscriptionAdapter,
  TranscriptionResult,
} from '@tanstack/ai'

void (undefined as unknown as GenerationArtifactDescriptor)
void (undefined as unknown as GenerationArtifactExtractionInput)
void (undefined as unknown as GenerationArtifactNameInput)

type AudioGenerateOptions = Parameters<typeof generateAudio>[0] & {
  threadId?: string
  runId?: string
  replay?: unknown
}

type TranscriptionGenerateOptions = Parameters<
  typeof generateTranscription
>[0] & {
  threadId?: string
  runId?: string
}

const imageAdapterTypes: ImageAdapter<string>['~types'] = {
  providerOptions: {},
  modelProviderOptionsByName: {},
  modelSizeByName: {},
  modelInputModalitiesByName: {},
}

const audioAdapterTypes: AudioAdapter<string>['~types'] = {
  providerOptions: {},
}

const transcriptionAdapterTypes: TranscriptionAdapter<string>['~types'] = {
  providerOptions: {},
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function imageAdapter(): ImageAdapter<string> {
  return {
    kind: 'image',
    name: 'test-image-provider',
    model: 'test-image-model',
    '~types': imageAdapterTypes,
    generateImages: vi.fn(async () => ({
      id: 'image-result',
      model: 'test-image-model',
      images: [{ b64Json: 'b3V0cHV0LWltYWdl' }],
    })),
  }
}

function audioAdapter(): AudioAdapter<string> {
  return {
    kind: 'audio',
    name: 'test-audio-provider',
    model: 'test-audio-model',
    '~types': audioAdapterTypes,
    generateAudio: vi.fn(async () => ({
      id: 'audio-result',
      model: 'test-audio-model',
      audio: {
        b64Json: 'b3V0cHV0LWF1ZGlv',
        contentType: 'audio/wav',
        duration: 1,
      },
    })),
  }
}

function transcriptionAdapter(): TranscriptionAdapter<string> {
  return {
    kind: 'transcription',
    name: 'test-transcription-provider',
    model: 'test-transcription-model',
    '~types': transcriptionAdapterTypes,
    transcribe: vi.fn(async () => ({
      id: 'transcription-result',
      model: 'test-transcription-model',
      text: 'hello world',
      language: 'en',
      segments: [{ id: 0, start: 0, end: 1, text: 'hello world' }],
    })),
  }
}

describe('withGenerationPersistence generation artifacts', () => {
  it('persists built-in image output artifacts and attaches refs', async () => {
    const persistence = memoryPersistence()

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-image',
      runId: 'run-image',
      middleware: [withGenerationPersistence(persistence)],
    })

    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts?.[0]).toMatchObject({
      role: 'output',
      threadId: 'thread-image',
      runId: 'run-image',
      mimeType: 'image/png',
      size: 12,
      source: {
        activity: 'image',
        path: 'images.0',
        provider: 'test-image-provider',
        model: 'test-image-model',
        mediaType: 'image',
      },
    })

    const record = await persistence.stores.artifacts!.get(
      result.artifacts![0]!.artifactId,
    )
    expect(record).toMatchObject({
      runId: 'run-image',
      threadId: 'thread-image',
      mimeType: 'image/png',
      size: 12,
    })
    const blob = await persistence.stores.blobs!.get(
      `artifacts/run-image/${result.artifacts![0]!.artifactId}`,
    )
    await expect(blob?.text()).resolves.toBe('output-image')
  })

  it('stamps a durable url on refs and rewrites the live result media (artifactUrl)', async () => {
    const persistence = memoryPersistence()

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-url',
      runId: 'run-url',
      middleware: [
        withGenerationPersistence(persistence, {
          artifactUrl: (ref) => `/artifacts/${ref.artifactId}`,
        }),
      ],
    })

    const ref = result.artifacts?.[0]
    expect(ref).toBeDefined()
    const expectedUrl = `/artifacts/${ref!.artifactId}`
    // The ref carries the durable serve URL...
    expect(ref!.url).toBe(expectedUrl)
    // ...and the live result's media points at it too (durable everywhere).
    expect(result.images[0]?.url).toBe(expectedUrl)
  })

  it('retrieveArtifact / retrieveBlob fetch a persisted artifact and its bytes', async () => {
    const persistence = memoryPersistence()

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-retrieve',
      runId: 'run-retrieve',
      middleware: [withGenerationPersistence(persistence)],
    })
    const artifactId = result.artifacts![0]!.artifactId

    const record = await retrieveArtifact(persistence, artifactId)
    expect(record).toMatchObject({
      runId: 'run-retrieve',
      mimeType: 'image/png',
    })

    // By id (resolves the record first) and by an already-loaded record.
    await expect(
      (await retrieveBlob(persistence, artifactId))?.text(),
    ).resolves.toBe('output-image')
    await expect(
      (await retrieveBlob(persistence, record!))?.text(),
    ).resolves.toBe('output-image')

    // Unknown id resolves to null on both.
    expect(await retrieveArtifact(persistence, 'missing')).toBeNull()
    expect(await retrieveBlob(persistence, 'missing')).toBeNull()
  })

  it('writes bytes under a custom storageKey and reads them back via blobKey', async () => {
    const persistence = memoryPersistence()

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-storage-key',
      runId: 'run-storage-key',
      middleware: [
        withGenerationPersistence(persistence, {
          storageKey: ({ runId, artifactId, role }) =>
            `my-app/videos/hero/${role}-${runId}-${artifactId}.png`,
        }),
      ],
    })

    const artifactId = result.artifacts![0]!.artifactId
    const expectedKey = `my-app/videos/hero/output-run-storage-key-${artifactId}.png`

    // The bytes land where the mapper said, NOT under the default convention.
    await expect(
      persistence.stores.blobs!.get(expectedKey).then((b) => b?.text()),
    ).resolves.toBe('output-image')
    expect(
      await persistence.stores.blobs!.get(
        `artifacts/run-storage-key/${artifactId}`,
      ),
    ).toBeNull()

    // The record remembers the real key, so reads resolve without recomputing.
    const record = await retrieveArtifact(persistence, artifactId)
    expect(record?.blobKey).toBe(expectedKey)
    await expect(
      (await retrieveBlob(persistence, artifactId))?.text(),
    ).resolves.toBe('output-image')
  })

  it('resolves a record written before blobKey existed via the default convention', async () => {
    const persistence = memoryPersistence()

    await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-legacy',
      runId: 'run-legacy',
      middleware: [withGenerationPersistence(persistence)],
    })
    const stored = (await persistence.stores.artifacts!.list('run-legacy'))[0]!

    // Simulate a row saved before the column existed: no blobKey at all.
    const { blobKey: _dropped, ...legacy } = stored
    await persistence.stores.artifacts!.save(legacy)

    // Still readable — the fallback is what makes blobKey a non-breaking add.
    await expect(
      (await retrieveBlob(persistence, legacy.artifactId))?.text(),
    ).resolves.toBe('output-image')
  })

  it('persists non-image media outputs', async () => {
    const persistence = memoryPersistence()

    const result = (await generateAudio({
      adapter: audioAdapter(),
      prompt: 'make audio',
      threadId: 'thread-audio',
      runId: 'run-audio',
      middleware: [withGenerationPersistence(persistence)],
    } as AudioGenerateOptions)) as AudioGenerationResult

    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts?.[0]).toMatchObject({
      role: 'output',
      mimeType: 'audio/wav',
      size: 12,
      source: {
        activity: 'audio',
        path: 'audio',
        mediaType: 'audio',
      },
    })
  })

  it('persists media inputs and includes input refs on the result', async () => {
    const persistence = memoryPersistence()

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: [
        { type: 'text', content: 'edit this' },
        {
          type: 'image',
          source: {
            type: 'data',
            value: 'aW5wdXQtaW1hZ2U=',
            mimeType: 'image/png',
          },
        },
      ],
      threadId: 'thread-input',
      runId: 'run-input',
      middleware: [withGenerationPersistence(persistence)],
    })

    expect(result.artifacts?.map((artifact) => artifact.role)).toEqual([
      'input',
      'output',
    ])
    const input = result.artifacts?.[0]
    expect(input).toMatchObject({
      role: 'input',
      mimeType: 'image/png',
      size: 11,
      source: { path: 'prompt.images.0', mediaType: 'image' },
    })
  })

  it('allows job tracking without artifact stores', () => {
    const full = memoryPersistence()
    const persistence = defineAIPersistence({
      stores: {
        generationRuns: full.stores.generationRuns,
      },
    })

    expect(() => withGenerationPersistence(persistence)).not.toThrow()
  })

  it('throws when the job store is missing', () => {
    const full = memoryPersistence()
    const persistence: AIPersistence = defineAIPersistence({
      stores: {
        runs: full.stores.runs,
      },
    })

    expect(() => withGenerationPersistence(persistence)).toThrow(
      /Generation persistence requires stores\.generationRuns/i,
    )
  })

  it('records a job that transitions running -> complete with result + artifacts', async () => {
    const persistence = memoryPersistence()

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-job',
      runId: 'run-job',
      middleware: [withGenerationPersistence(persistence)],
    })

    const job = await persistence.stores.generationRuns.get('run-job')
    expect(job).toMatchObject({
      runId: 'run-job',
      threadId: 'thread-job',
      activity: 'image',
      provider: 'test-image-provider',
      model: 'test-image-model',
      status: 'complete',
    })
    expect(job?.finishedAt).toEqual(expect.any(Number))
    // Terminal result metadata is captured on the job (never the media bytes).
    expect(job?.result).toBeDefined()
    // Persisted artifact refs land on the job too.
    expect(job?.artifacts).toHaveLength(1)
    expect(job?.artifacts?.[0]?.artifactId).toBe(
      result.artifacts![0]!.artifactId,
    )
  })

  it('links the job to a thread and finds the latest for that thread', async () => {
    const persistence = memoryPersistence()

    await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-latest',
      runId: 'run-latest-1',
      middleware: [withGenerationPersistence(persistence)],
    })

    const latest =
      await persistence.stores.generationRuns.findLatestForThread!(
        'thread-latest',
      )
    expect(latest?.runId).toBe('run-latest-1')
    expect(latest?.status).toBe('complete')
  })

  it('records an error job when generation throws', async () => {
    const persistence = memoryPersistence()
    const adapter = imageAdapter()
    adapter.generateImages = vi.fn(async () => {
      throw new Error('boom')
    })

    await expect(
      generateImage({
        adapter,
        prompt: 'make an image',
        threadId: 'thread-error',
        runId: 'run-error',
        middleware: [withGenerationPersistence(persistence)],
      }),
    ).rejects.toThrow('boom')

    const job = await persistence.stores.generationRuns.get('run-error')
    expect(job).toMatchObject({
      runId: 'run-error',
      status: 'error',
      error: { message: 'boom' },
    })
  })

  it('uses custom artifact extraction instead of built-in extraction', async () => {
    const persistence = memoryPersistence()

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: [
        { type: 'text', content: 'edit this' },
        {
          type: 'image',
          source: {
            type: 'data',
            value: 'aW5wdXQtaW1hZ2U=',
            mimeType: 'image/png',
          },
        },
      ],
      threadId: 'thread-custom',
      runId: 'run-custom',
      middleware: [
        withGenerationPersistence(persistence, {
          extractArtifacts: () => [
            {
              role: 'output',
              path: 'custom',
              mediaType: 'json',
              mimeType: 'application/json',
              json: { ok: true },
              name: 'custom.json',
            },
          ],
        }),
      ],
    })

    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts?.[0]).toMatchObject({
      name: 'custom.json',
      mimeType: 'application/json',
      source: { path: 'custom', mediaType: 'json' },
    })
  })

  it('does not leak data URL bytes into artifact refs', async () => {
    const persistence = memoryPersistence()
    const dataUrl = 'data:image/png;base64,ZGF0YS11cmwtYnl0ZXM='

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-data-url',
      runId: 'run-data-url',
      middleware: [
        withGenerationPersistence(persistence, {
          extractArtifacts: () => [
            {
              role: 'input',
              path: 'prompt.images.0',
              mediaType: 'image',
              url: dataUrl,
            },
            {
              role: 'output',
              path: 'images.0',
              mediaType: 'image',
              url: dataUrl,
            },
          ],
        }),
      ],
    })

    expect(result.artifacts).toHaveLength(2)
    expect(result.artifacts?.map((artifact) => artifact.sourceUrl)).toEqual([
      undefined,
      undefined,
    ])
    expect(JSON.stringify(result.artifacts)).not.toContain(dataUrl)

    const [input, output] = result.artifacts!
    await expect(
      persistence.stores.blobs
        ?.get(`artifacts/run-data-url/${input!.artifactId}`)
        .then((blob) => blob?.text()),
    ).resolves.toBe('data-url-bytes')
    await expect(
      persistence.stores.blobs
        ?.get(`artifacts/run-data-url/${output!.artifactId}`)
        .then((blob) => blob?.text()),
    ).resolves.toBe('data-url-bytes')
  })

  it('uses nameArtifact overrides', async () => {
    const persistence = memoryPersistence()

    const result = (await generateAudio({
      adapter: audioAdapter(),
      prompt: 'make audio',
      threadId: 'thread-name',
      runId: 'run-name',
      middleware: [
        withGenerationPersistence(persistence, {
          nameArtifact: ({ descriptor, index }) =>
            `${descriptor.role}-${descriptor.mediaType}-${index}.bin`,
        }),
      ],
    } as AudioGenerateOptions)) as AudioGenerationResult

    expect(result.artifacts?.[0]?.name).toBe('output-audio-0.bin')
  })

  it('emits generation:artifacts before generation:result with persisted refs', async () => {
    const persistence = memoryPersistence()

    const chunks = await collect(
      generateImage<ImageAdapter<string>, true>({
        adapter: imageAdapter(),
        prompt: 'make an image',
        stream: true,
        threadId: 'thread-stream',
        runId: 'run-stream',
        middleware: [withGenerationPersistence(persistence)],
      }),
    )

    const customEvents = chunks.filter(
      (chunk) => chunk.type === EventType.CUSTOM,
    )
    expect(customEvents.map((chunk) => chunk.name)).toEqual([
      'generation:artifacts',
      'generation:result',
    ])
    expect(customEvents[0]?.value).toEqual(
      (customEvents[1]?.value as { artifacts?: unknown }).artifacts,
    )
  })

  it('uses the same fallback run and thread ids for streamed events and persisted artifact refs', async () => {
    const persistence = memoryPersistence()

    const chunks = await collect(
      generateImage<ImageAdapter<string>, true>({
        adapter: imageAdapter(),
        prompt: 'make an image',
        stream: true,
        middleware: [withGenerationPersistence(persistence)],
      }),
    )

    const started = chunks.find((chunk) => chunk.type === EventType.RUN_STARTED)
    const result = chunks.find(
      (chunk) =>
        chunk.type === EventType.CUSTOM && chunk.name === 'generation:result',
    )
    const artifact = (
      result as unknown as
        | { value?: { artifacts?: Array<PersistedArtifactRef> } }
        | undefined
    )?.value?.artifacts?.[0]

    expect(started).toMatchObject({
      runId: expect.any(String),
      threadId: expect.any(String),
    })
    expect(artifact).toMatchObject({
      runId: started?.runId,
      threadId: started?.threadId,
    })
    await expect(
      persistence.stores.artifacts!.list(started!.runId!),
    ).resolves.toHaveLength(1)
  })

  it('does not persist generation artifacts when artifact stores are removed', async () => {
    const full = memoryPersistence()
    const put = vi.spyOn(full.stores.blobs, 'put')
    const save = vi.spyOn(full.stores.artifacts, 'save')
    const persistence = composePersistence(full, {
      overrides: { artifacts: false, blobs: false },
    })

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-messages-only',
      runId: 'run-messages-only',
      middleware: [withGenerationPersistence(persistence)],
    })

    expect(result.artifacts).toBeUndefined()
    expect(put).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('fails early when artifact persistence is enabled without a paired blob store', () => {
    const full = memoryPersistence()
    const persistence: AIPersistence = defineAIPersistence({
      stores: {
        artifacts: full.stores.artifacts,
      },
    })

    expect(() => withGenerationPersistence(persistence)).toThrow(
      /artifact persistence requires both stores\.artifacts and stores\.blobs/i,
    )
  })

  it('persists transcription structured JSON output', async () => {
    const persistence = memoryPersistence()

    const result = (await generateTranscription({
      adapter: transcriptionAdapter(),
      audio: 'aW5wdXQtYXVkaW8=',
      responseFormat: 'verbose_json',
      threadId: 'thread-transcription',
      runId: 'run-transcription',
      middleware: [withGenerationPersistence(persistence)],
    } as TranscriptionGenerateOptions)) as TranscriptionResult

    expect(result.artifacts?.map((artifact) => artifact.role)).toEqual([
      'input',
      'output',
    ])
    const structured = result.artifacts?.find(
      (artifact) => artifact.source.mediaType === 'json',
    ) as PersistedArtifactRef | undefined
    expect(structured).toMatchObject({
      role: 'output',
      mimeType: 'application/json',
      source: {
        activity: 'transcription',
        path: 'transcription',
        mediaType: 'json',
      },
    })
    const blob = await persistence.stores.blobs!.get(
      `artifacts/run-transcription/${structured!.artifactId}`,
    )
    await expect(blob?.text()).resolves.toContain('"segments"')
  })
})

describe('artifact URL fetching', () => {
  /** An image adapter whose result is a URL rather than inline base64. */
  function urlImageAdapter(url: string): ImageAdapter<string> {
    return {
      kind: 'image',
      name: 'test-image-provider',
      model: 'test-image-model',
      '~types': imageAdapterTypes,
      generateImages: vi.fn(async () => ({
        id: 'image-result',
        model: 'test-image-model',
        images: [{ url }],
      })),
    }
  }

  function okFetch(body: string) {
    return vi.fn(async () => new Response(body, { status: 200 }))
  }

  /** A prompt referencing media by URL — the caller-controlled input case. */
  function urlPrompt(url: string) {
    return [
      { type: 'text' as const, content: 'edit this' },
      {
        type: 'image' as const,
        source: { type: 'url' as const, value: url, mimeType: 'image/png' },
      },
    ]
  }

  it('does not fetch a caller-supplied input URL by default', async () => {
    const persistence = memoryPersistence()
    const artifactFetch = okFetch('input-bytes')

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: urlPrompt('https://evil.example.com/pixel.png'),
      threadId: 'thread-input-url',
      runId: 'run-input-url',
      middleware: [withGenerationPersistence(persistence, { artifactFetch })],
    })

    expect(artifactFetch).not.toHaveBeenCalled()
    // Only the generated output is persisted; the input URL is skipped whole.
    expect(result.artifacts?.map((artifact) => artifact.role)).toEqual([
      'output',
    ])
  })

  it('fetches an input URL once allowInputUrl approves it', async () => {
    const persistence = memoryPersistence()
    const artifactFetch = okFetch('input-bytes')

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: urlPrompt('https://cdn.example.com/pixel.png'),
      threadId: 'thread-allow',
      runId: 'run-allow',
      middleware: [
        withGenerationPersistence(persistence, {
          artifactFetch,
          allowInputUrl: ({ url }) => url.hostname === 'cdn.example.com',
        }),
      ],
    })

    expect(artifactFetch).toHaveBeenCalledTimes(1)
    const input = result.artifacts?.find((a) => a.role === 'input')
    expect(input).toBeDefined()
    const blob = await persistence.stores.blobs!.get(
      `artifacts/run-allow/${input!.artifactId}`,
    )
    await expect(blob?.text()).resolves.toBe('input-bytes')
  })

  it('rejects an input URL that allowInputUrl declines', async () => {
    const persistence = memoryPersistence()
    const artifactFetch = okFetch('input-bytes')

    await expect(
      generateImage({
        adapter: imageAdapter(),
        prompt: urlPrompt('https://other.example.com/pixel.png'),
        threadId: 'thread-deny',
        runId: 'run-deny',
        middleware: [
          withGenerationPersistence(persistence, {
            artifactFetch,
            allowInputUrl: ({ url }) => url.hostname === 'cdn.example.com',
          }),
        ],
      }),
    ).rejects.toThrow(/rejected by allowInputUrl/)
    expect(artifactFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['loopback', 'http://127.0.0.1:8080/admin'],
    ['localhost', 'http://localhost:8080/admin'],
    ['private range', 'http://10.0.0.5/internal'],
    ['ipv6 loopback', 'http://[::1]:8080/admin'],
    ['ipv4-mapped ipv6', 'http://[::ffff:127.0.0.1]/admin'],
  ])('blocks an internal input host (%s)', async (_label, url) => {
    const persistence = memoryPersistence()
    const artifactFetch = okFetch('secrets')

    await expect(
      generateImage({
        adapter: imageAdapter(),
        prompt: urlPrompt(url),
        threadId: 'thread-ssrf',
        runId: 'run-ssrf',
        middleware: [
          withGenerationPersistence(persistence, {
            artifactFetch,
            // Even a wide-open predicate must not defeat the host block.
            allowInputUrl: () => true,
          }),
        ],
      }),
    ).rejects.toThrow(/internal host/)
    expect(artifactFetch).not.toHaveBeenCalled()
  })

  it('refuses a non-http artifact URL', async () => {
    const persistence = memoryPersistence()
    const artifactFetch = okFetch('nope')

    await expect(
      generateImage({
        adapter: urlImageAdapter('file:///etc/passwd'),
        prompt: 'make an image',
        threadId: 'thread-scheme',
        runId: 'run-scheme',
        middleware: [withGenerationPersistence(persistence, { artifactFetch })],
      }),
    ).rejects.toThrow(/Refusing to fetch artifact over file:/)
    expect(artifactFetch).not.toHaveBeenCalled()
  })

  it('still fetches a provider output URL, and allows internal provider hosts', async () => {
    const persistence = memoryPersistence()
    // A self-hosted provider legitimately returns a loopback URL; the internal
    // host block applies to caller-supplied input URLs only.
    const artifactFetch = okFetch('generated-bytes')

    const result = await generateImage({
      adapter: urlImageAdapter('http://127.0.0.1:11434/out.png'),
      prompt: 'make an image',
      threadId: 'thread-output',
      runId: 'run-output',
      middleware: [withGenerationPersistence(persistence, { artifactFetch })],
    })

    expect(artifactFetch).toHaveBeenCalledTimes(1)
    const output = result.artifacts?.find((a) => a.role === 'output')
    const blob = await persistence.stores.blobs!.get(
      `artifacts/run-output/${output!.artifactId}`,
    )
    await expect(blob?.text()).resolves.toBe('generated-bytes')
  })

  it('refuses an artifact larger than maxArtifactBytes', async () => {
    const persistence = memoryPersistence()
    const artifactFetch = vi.fn(
      async () =>
        new Response('x'.repeat(50), {
          status: 200,
          headers: { 'content-length': '50' },
        }),
    )

    await expect(
      generateImage({
        adapter: urlImageAdapter('https://cdn.example.com/big.png'),
        prompt: 'make an image',
        threadId: 'thread-cap',
        runId: 'run-cap',
        middleware: [
          withGenerationPersistence(persistence, {
            artifactFetch,
            maxArtifactBytes: 10,
          }),
        ],
      }),
    ).rejects.toThrow(/exceeds maxArtifactBytes/)
  })
})
