import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  generateAudio,
  generateImage,
  generateSpeech,
  generateTranscription,
  generateVideo,
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
  BlobBody,
  BlobPutOptions,
  BlobStore,
} from '../src'
import type {
  AudioAdapter,
  AudioGenerationResult,
  ImageAdapter,
  PersistedArtifactRef,
  StreamChunk,
  TTSAdapter,
  TranscriptionAdapter,
  TranscriptionResult,
  VideoAdapter,
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

/** `audio` is base64 rather than a media object — the `tts` shape. */
function speechAdapter(format?: string): TTSAdapter<string> {
  return {
    kind: 'tts',
    name: 'test-speech-provider',
    model: 'test-speech-model',
    '~types': { providerOptions: {} },
    generateSpeech: vi.fn(async () => ({
      id: 'speech-result',
      model: 'test-speech-model',
      // 'spoken-words'
      audio: 'c3Bva2VuLXdvcmRz',
      format: format ?? 'mp3',
    })),
  }
}

/** A video job that is already finished the first time it is polled. */
function videoAdapter(url: string, expiresAt?: Date): VideoAdapter<string> {
  return {
    kind: 'video',
    name: 'test-video-provider',
    model: 'test-video-model',
    '~types': {
      providerOptions: {},
      modelProviderOptionsByName: {},
      modelSizeByName: {},
      modelInputModalitiesByName: {},
      modelDurationByName: {},
    },
    createVideoJob: vi.fn(async () => ({
      jobId: 'video-job-1',
      model: 'test-video-model',
    })),
    getVideoStatus: vi.fn(async () => ({
      jobId: 'video-job-1',
      status: 'completed' as const,
    })),
    getVideoUrl: vi.fn(async () => ({ jobId: 'video-job-1', url, expiresAt })),
    availableDurations: () => ({ kind: 'none' }),
    snapDuration: () => undefined,
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
      middleware: [
        withGenerationPersistence(persistence, { threadId: 'thread-image' }),
      ],
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
          threadId: 'thread-url',
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
      middleware: [
        withGenerationPersistence(persistence, { threadId: 'thread-retrieve' }),
      ],
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
          threadId: 'thread-storage-key',
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
      middleware: [
        withGenerationPersistence(persistence, { threadId: 'thread-legacy' }),
      ],
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
      middleware: [
        withGenerationPersistence(persistence, { threadId: 'thread-audio' }),
      ],
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
      middleware: [
        withGenerationPersistence(persistence, { threadId: 'thread-input' }),
      ],
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

    expect(() =>
      withGenerationPersistence(persistence, { threadId: 'thread-test' }),
    ).not.toThrow()
  })

  it('throws when the job store is missing', () => {
    const full = memoryPersistence()
    const persistence: AIPersistence = defineAIPersistence({
      stores: {
        runs: full.stores.runs,
      },
    })

    expect(() =>
      withGenerationPersistence(persistence, { threadId: 'thread-test' }),
    ).toThrow(/Generation persistence requires stores\.generationRuns/i)
  })

  it('records a job that transitions running -> complete with result + artifacts', async () => {
    const persistence = memoryPersistence()

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-job',
      runId: 'run-job',
      middleware: [
        withGenerationPersistence(persistence, { threadId: 'thread-job' }),
      ],
    })

    const job = await persistence.stores.generationRuns.get('run-job')
    expect(job).toMatchObject({
      runId: 'run-job',
      threadId: 'thread-job',
      activity: 'image',
      provider: 'test-image-provider',
      model: 'test-image-model',
      status: 'completed',
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
      middleware: [
        withGenerationPersistence(persistence, { threadId: 'thread-latest' }),
      ],
    })

    const latest =
      await persistence.stores.generationRuns.findLatestForThread!(
        'thread-latest',
      )
    expect(latest?.runId).toBe('run-latest-1')
    expect(latest?.status).toBe('completed')
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
        middleware: [
          withGenerationPersistence(persistence, { threadId: 'thread-error' }),
        ],
      }),
    ).rejects.toThrow('boom')

    const job = await persistence.stores.generationRuns.get('run-error')
    expect(job).toMatchObject({
      runId: 'run-error',
      status: 'failed',
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
          threadId: 'thread-custom',
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
          threadId: 'thread-data-url',
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
          threadId: 'thread-name',
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
        middleware: [
          withGenerationPersistence(persistence, { threadId: 'thread-stream' }),
        ],
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

  it('files artifacts under the required threadId, not the minted wire one', async () => {
    const persistence = memoryPersistence()

    const chunks = await collect(
      generateImage<ImageAdapter<string>, true>({
        adapter: imageAdapter(),
        prompt: 'make an image',
        stream: true,
        middleware: [
          withGenerationPersistence(persistence, { threadId: 'thread-test' }),
        ],
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
    // The run id still falls back in lockstep with the wire.
    expect(artifact).toMatchObject({ runId: started?.runId })
    // The thread id deliberately does NOT: the caller named the scope on the
    // middleware, and the activity minted a throwaway id for its wire chunks
    // because none was passed to it. Persisting the minted one would file the
    // artifact in a slot nothing can look up.
    expect(artifact?.threadId).toBe('thread-test')
    expect(artifact?.threadId).not.toBe(started?.threadId)
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
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-messages-only',
        }),
      ],
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

    expect(() =>
      withGenerationPersistence(persistence, {
        threadId: 'thread-messages-only',
      }),
    ).toThrow(
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
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-transcription',
        }),
      ],
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

  it('persists tts output and derives its mime type from the format', async () => {
    const persistence = memoryPersistence()

    const result = await generateSpeech({
      adapter: speechAdapter('wav'),
      text: 'hello there',
      threadId: 'thread-tts',
      runId: 'run-tts',
      middleware: [
        withGenerationPersistence(persistence, { threadId: 'thread-tts' }),
      ],
    })

    expect(result.artifacts).toHaveLength(1)
    const speech = result.artifacts![0]!
    expect(speech).toMatchObject({
      role: 'output',
      // No `contentType` on the result, so the mime type comes from `format`.
      mimeType: 'audio/wav',
      size: 12,
      source: { activity: 'tts', path: 'audio', mediaType: 'audio' },
    })
    const blob = await persistence.stores.blobs!.get(
      `artifacts/run-tts/${speech.artifactId}`,
    )
    await expect(blob?.text()).resolves.toBe('spoken-words')

    const job = await persistence.stores.generationRuns.get('run-tts')
    expect(job).toMatchObject({ activity: 'tts', status: 'completed' })
    expect(job?.artifacts?.[0]?.artifactId).toBe(speech.artifactId)
  })

  it('falls back to audio/mpeg when the tts result names no format', async () => {
    const persistence = memoryPersistence()
    const adapter = speechAdapter()
    adapter.generateSpeech = vi.fn(async () => ({
      id: 'speech-result',
      model: 'test-speech-model',
      audio: 'c3Bva2VuLXdvcmRz',
      format: '',
    }))

    const result = await generateSpeech({
      adapter,
      text: 'hello there',
      threadId: 'thread-tts-default',
      runId: 'run-tts-default',
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-tts-default',
        }),
      ],
    })

    expect(result.artifacts?.[0]).toMatchObject({ mimeType: 'audio/mpeg' })
  })

  it('persists a video output by fetching the provider url', async () => {
    const persistence = memoryPersistence()
    const expiresAt = new Date('2030-01-01T00:00:00.000Z')
    const artifactFetch = vi.fn(
      async () => new Response('video-bytes', { status: 200 }),
    )

    const chunks = await collect(
      generateVideo({
        adapter: videoAdapter('https://cdn.example.com/out.mp4', expiresAt),
        prompt: 'make a video',
        stream: true,
        pollingInterval: 0,
        threadId: 'thread-video',
        runId: 'run-video',
        middleware: [
          withGenerationPersistence(persistence, {
            threadId: 'thread-video',
            artifactFetch,
          }),
        ],
      }),
    )

    const resultChunk = chunks.find(
      (chunk) =>
        chunk.type === EventType.CUSTOM && chunk.name === 'generation:result',
    )
    const value = (
      resultChunk as { value: { artifacts?: Array<PersistedArtifactRef> } }
    ).value
    expect(value.artifacts).toHaveLength(1)
    const video = value.artifacts![0]!
    expect(video).toMatchObject({
      role: 'output',
      mimeType: 'video/mp4',
      sourceUrl: 'https://cdn.example.com/out.mp4',
      source: {
        activity: 'video',
        path: 'video',
        mediaType: 'video',
        // The provider job id and expiry ride along on the ref, so a restored
        // result can still tell how long the original link was good for.
        jobId: 'video-job-1',
        expiresAt: expiresAt.toISOString(),
      },
    })

    const blob = await persistence.stores.blobs!.get(
      `artifacts/run-video/${video.artifactId}`,
    )
    await expect(blob?.text()).resolves.toBe('video-bytes')

    const job = await persistence.stores.generationRuns.get('run-video')
    expect(job).toMatchObject({ activity: 'video', status: 'completed' })
    expect(job?.artifacts?.[0]?.artifactId).toBe(video.artifactId)
  })

  it('throws when no threadId is available', async () => {
    const persistence = memoryPersistence()

    await expect(
      generateImage({
        adapter: imageAdapter(),
        prompt: 'make an image',
        runId: 'run-unscoped',
        // Neither the activity nor the options names a scope.
        middleware: [withGenerationPersistence(persistence)],
      }),
    ).rejects.toThrow(/Generation persistence requires a `threadId`/)

    // The run is refused outright rather than filed somewhere unhydratable.
    expect(
      await persistence.stores.generationRuns.get('run-unscoped'),
    ).toBeNull()
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

  /**
   * A blob store standing in for workerd + R2: its "bucket" refuses a stream
   * that carries no declared length, exactly as `R2Bucket.put` does
   * (`TypeError: Provided readable stream must have a known length`). The store
   * itself follows the recipe the Cloudflare skill documents — re-declare the
   * length from `expectedLength` when the producer knows it, otherwise buffer
   * the stream into parts and upload them — and records which path it took so
   * a test can pin the hint to an observable effect.
   */
  function lengthStrictBlobStore() {
    const uploads: Array<'single-shot' | 'multipart'> = []
    // Stand-in for `FixedLengthStream`: the marker workerd checks for.
    const declared = new WeakSet<ReadableStream<Uint8Array>>()
    const bucket = memoryPersistence().stores.blobs

    async function bucketPut(
      key: string,
      body: BlobBody,
      options?: BlobPutOptions,
    ) {
      if (body instanceof ReadableStream && !declared.has(body)) {
        throw new TypeError('Provided readable stream must have a known length')
      }
      return await bucket.put(key, body, options)
    }

    const store: BlobStore = {
      async put(key, body, options) {
        if (!(body instanceof ReadableStream)) {
          return await bucketPut(key, body, options)
        }
        if (options?.expectedLength !== undefined) {
          // `FixedLengthStream`: same bytes, now carrying a declared length.
          const fixed = body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>(),
          )
          declared.add(fixed)
          uploads.push('single-shot')
          return await bucketPut(key, fixed, options)
        }
        // No length to declare: drain the stream into parts instead. Real
        // multipart uploads them one at a time; buffering here is enough to
        // prove the store never hands the bucket a length-less stream.
        const reader = body.getReader()
        const parts: Array<Uint8Array> = []
        let total = 0
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          parts.push(value)
          total += value.byteLength
        }
        const bytes = new Uint8Array(total)
        let offset = 0
        for (const part of parts) {
          bytes.set(part, offset)
          offset += part.byteLength
        }
        uploads.push('multipart')
        return await bucketPut(key, bytes, options)
      },
      get: (key, options) => bucket.get(key, options),
      head: (key) => bucket.head(key),
      delete: (key) => bucket.delete(key),
      list: (options) => bucket.list(options),
    }
    return { store, uploads }
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
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-input-url',
          artifactFetch,
        }),
      ],
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
          threadId: 'thread-allow',
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
            threadId: 'thread-deny',
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
            threadId: 'thread-ssrf',
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
        middleware: [
          withGenerationPersistence(persistence, {
            threadId: 'thread-scheme',
            artifactFetch,
          }),
        ],
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
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-output',
          artifactFetch,
        }),
      ],
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
            threadId: 'thread-cap',
            artifactFetch,
            maxArtifactBytes: 10,
          }),
        ],
      }),
    ).rejects.toThrow(/exceeds maxArtifactBytes/)
  })

  it('caps a chunked body that declares no content-length', async () => {
    const persistence = memoryPersistence()
    const encoder = new TextEncoder()
    // No `content-length`, so the advisory header check cannot catch this and
    // the cap has to fire while the body drains. The first chunk is under the
    // limit; the running total only crosses it on the second.
    const artifactFetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode('x'.repeat(8)))
              controller.enqueue(encoder.encode('y'.repeat(8)))
              controller.close()
            },
          }),
          { status: 200 },
        ),
    )

    await expect(
      generateImage({
        adapter: urlImageAdapter('https://cdn.example.com/chunked.png'),
        prompt: 'make an image',
        threadId: 'thread-chunked',
        runId: 'run-chunked',
        middleware: [
          withGenerationPersistence(persistence, {
            threadId: 'thread-chunked',
            artifactFetch,
            maxArtifactBytes: 10,
          }),
        ],
      }),
    ).rejects.toThrow(/exceeds maxArtifactBytes/)

    const job = await persistence.stores.generationRuns.get('run-chunked')
    expect(job).toMatchObject({ status: 'failed' })
    expect(job?.artifacts).toBeUndefined()
  })

  it('forwards a trustworthy content-length to the blob store as expectedLength', async () => {
    const persistence = memoryPersistence()
    const artifactFetch = vi.fn(
      async () =>
        new Response('generated-bytes', {
          status: 200,
          headers: { 'content-length': '15' },
        }),
    )
    const putSpy = vi.spyOn(persistence.stores.blobs!, 'put')

    await generateImage({
      adapter: urlImageAdapter('https://cdn.example.com/out.png'),
      prompt: 'make an image',
      threadId: 'thread-hint',
      runId: 'run-hint',
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-hint',
          artifactFetch,
        }),
      ],
    })

    expect(putSpy).toHaveBeenCalled()
    expect(putSpy.mock.calls[0]?.[2]?.expectedLength).toBe(15)
  })

  it('omits expectedLength when the origin declares no length', async () => {
    const persistence = memoryPersistence()
    // A chunked reply declares no length — and `Number(null) === 0` must not
    // read that as a declared length of 0.
    const artifactFetch = vi.fn(
      async () => new Response('generated-bytes', { status: 200 }),
    )
    const putSpy = vi.spyOn(persistence.stores.blobs!, 'put')

    await generateImage({
      adapter: urlImageAdapter('https://cdn.example.com/out.png'),
      prompt: 'make an image',
      threadId: 'thread-no-length',
      runId: 'run-no-length',
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-no-length',
          artifactFetch,
        }),
      ],
    })

    expect(putSpy).toHaveBeenCalled()
    expect(putSpy.mock.calls[0]?.[2]?.expectedLength).toBeUndefined()
  })

  it('omits expectedLength when the response is content-encoded', async () => {
    const persistence = memoryPersistence()
    // fetch transparently decompresses: a gzipped reply's content-length is
    // the COMPRESSED size, so it cannot describe the decoded stream the store
    // drains. Forwarding it would be worse than no hint.
    const artifactFetch = vi.fn(
      async () =>
        new Response('generated-bytes', {
          status: 200,
          headers: { 'content-length': '15', 'content-encoding': 'gzip' },
        }),
    )
    const putSpy = vi.spyOn(persistence.stores.blobs!, 'put')

    await generateImage({
      adapter: urlImageAdapter('https://cdn.example.com/out.png'),
      prompt: 'make an image',
      threadId: 'thread-encoded',
      runId: 'run-encoded',
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-encoded',
          artifactFetch,
        }),
      ],
    })

    expect(putSpy).toHaveBeenCalled()
    expect(putSpy.mock.calls[0]?.[2]?.expectedLength).toBeUndefined()
  })

  it('defaults maxArtifactBytes to 1 GiB', async () => {
    const persistence = memoryPersistence()
    // Declared above the old 100 MiB default but below 1 GiB: must persist.
    // Nothing buffers a byte of it — the cap is a drain-time counter and the
    // declared length is only read from the header.
    const artifactFetch = vi.fn(
      async () =>
        new Response('ok', {
          status: 200,
          headers: { 'content-length': String(150 * 1024 * 1024) },
        }),
    )
    const result = await generateImage({
      adapter: urlImageAdapter('https://cdn.example.com/big.png'),
      prompt: 'make an image',
      threadId: 'thread-default-cap',
      runId: 'run-default-cap',
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-default-cap',
          artifactFetch,
        }),
      ],
    })
    expect(result.artifacts?.some((a) => a.role === 'output')).toBe(true)

    // Declared above 1 GiB: the early-reject fires before a byte is read.
    const tooBigFetch = vi.fn(
      async () =>
        new Response('ok', {
          status: 200,
          headers: { 'content-length': String(1025 * 1024 * 1024) },
        }),
    )
    await expect(
      generateImage({
        adapter: urlImageAdapter('https://cdn.example.com/huge.png'),
        prompt: 'make an image',
        threadId: 'thread-default-cap',
        runId: 'run-too-big',
        middleware: [
          withGenerationPersistence(persistence, {
            threadId: 'thread-default-cap',
            artifactFetch: tooBigFetch,
          }),
        ],
      }),
    ).rejects.toThrow(/exceeds maxArtifactBytes/)
  })

  const wrapCases: Array<{
    name: string
    headers: Record<string, string>
    wrapped: boolean
  }> = [
    {
      name: 'trustworthy content-length: passed through untouched',
      headers: { 'content-length': '15' },
      wrapped: false,
    },
    {
      name: 'chunked reply: wrapped, nothing else bounds it',
      headers: {},
      wrapped: true,
    },
    {
      name: 'content-encoded: wrapped, the declared length is the compressed size',
      headers: { 'content-length': '15', 'content-encoding': 'gzip' },
      wrapped: true,
    },
  ]

  it.each(wrapCases)(
    'caps by wrapping the body only when it has to ($name)',
    async ({ headers, wrapped }) => {
      // The wrapper is a TransformStream, and a transform's readable side has no
      // declared length — the whole of #1030. So it is applied only where it is
      // load-bearing: when `content-length` describes what the store will drain,
      // HTTP framing already holds the origin to it and the body goes through
      // untouched, length intact, ready for a single-shot `R2Bucket.put`.
      const persistence = memoryPersistence()
      const response = new Response('generated-bytes', { status: 200, headers })
      const responseBody = response.body
      const putSpy = vi.spyOn(persistence.stores.blobs!, 'put')

      const result = await generateImage({
        adapter: urlImageAdapter('https://cdn.example.com/out.png'),
        prompt: 'make an image',
        threadId: 'thread-wrap',
        runId: 'run-wrap',
        middleware: [
          withGenerationPersistence(persistence, {
            threadId: 'thread-wrap',
            artifactFetch: vi.fn(async () => response),
          }),
        ],
      })

      const body = putSpy.mock.calls[0]?.[1]
      if (wrapped) {
        expect(body).not.toBe(responseBody)
      } else {
        expect(body).toBe(responseBody)
      }
      // Wrapped or not, the bytes land intact.
      const ref = result.artifacts?.find((a) => a.role === 'output')
      await expect(
        (await retrieveBlob(persistence, ref!.artifactId))?.text(),
      ).resolves.toBe('generated-bytes')
    },
  )

  it('still caps a chunked body during the drain', async () => {
    const persistence = memoryPersistence()
    // No declared length, so nothing bounds the transfer but the counter —
    // this is the case the wrapper exists for.
    const artifactFetch = vi.fn(
      async () => new Response('generated-bytes', { status: 200 }),
    )

    await expect(
      generateImage({
        adapter: urlImageAdapter('https://cdn.example.com/out.png'),
        prompt: 'make an image',
        threadId: 'thread-drain-cap',
        runId: 'run-drain-cap',
        middleware: [
          withGenerationPersistence(persistence, {
            threadId: 'thread-drain-cap',
            artifactFetch,
            maxArtifactBytes: 4,
          }),
        ],
      }),
    ).rejects.toThrow(/exceeds maxArtifactBytes/)
  })

  it('maxArtifactBytes: false hands the store the untouched fetch body', async () => {
    const persistence = memoryPersistence()
    // The zero-copy path for workerd + R2: with no cap there is no
    // TransformStream wrapper, so the store receives the very stream `fetch`
    // produced — which on workerd still carries its own declared length, so
    // `R2Bucket.put` single-shots it with no hint and no multipart. Identity,
    // not equality, is the assertion that pins that down.
    const response = new Response('generated-bytes', {
      status: 200,
      // Far above the 1 GiB default: an uncapped fetch must not consult it.
      headers: { 'content-length': String(8 * 1024 * 1024 * 1024) },
    })
    const responseBody = response.body
    const artifactFetch = vi.fn(async () => response)
    const putSpy = vi.spyOn(persistence.stores.blobs!, 'put')

    const result = await generateImage({
      adapter: urlImageAdapter('https://cdn.example.com/huge.mp4'),
      prompt: 'make a video',
      threadId: 'thread-uncapped',
      runId: 'run-uncapped',
      middleware: [
        withGenerationPersistence(persistence, {
          threadId: 'thread-uncapped',
          artifactFetch,
          maxArtifactBytes: false,
        }),
      ],
    })

    expect(putSpy.mock.calls[0]?.[1]).toBe(responseBody)
    const ref = result.artifacts?.find((a) => a.role === 'output')
    await expect(
      (await retrieveBlob(persistence, ref!.artifactId))?.text(),
    ).resolves.toBe('generated-bytes')
  })

  it.each([
    { name: 'declared length: single-shot', contentLength: '15' as const },
    { name: 'no declared length: multipart', contentLength: undefined },
  ])(
    'persists a URL artifact into a length-strict store ($name)',
    async ({ contentLength }) => {
      // The #1030 regression, end to end: workerd's `R2Bucket.put` rejects a
      // stream with no declared length, and the cap-enforcing wrapper strips
      // the length off every URL-fetched body. `lengthStrictBlobStore` is that
      // rule in miniature, so this fails the moment the middleware stops
      // forwarding `expectedLength` — or a store follows the old "pass the
      // body straight through" recipe.
      const strict = lengthStrictBlobStore()
      const persistence = composePersistence(memoryPersistence(), {
        overrides: { blobs: strict.store },
      })
      const artifactFetch = vi.fn(
        async () =>
          new Response('generated-bytes', {
            status: 200,
            ...(contentLength
              ? { headers: { 'content-length': contentLength } }
              : {}),
          }),
      )

      const result = await generateImage({
        adapter: urlImageAdapter('https://cdn.example.com/out.png'),
        prompt: 'make an image',
        threadId: 'thread-strict',
        runId: 'run-strict',
        middleware: [
          withGenerationPersistence(persistence, {
            threadId: 'thread-strict',
            artifactFetch,
          }),
        ],
      })

      const ref = result.artifacts?.find((a) => a.role === 'output')
      expect(ref?.size).toBe(15)
      await expect(
        (await retrieveBlob(persistence, ref!.artifactId))?.text(),
      ).resolves.toBe('generated-bytes')
      // Which upload path the store took follows from the hint, and the hint
      // follows from the origin declaring a length.
      expect(strict.uploads).toEqual([
        contentLength ? 'single-shot' : 'multipart',
      ])
    },
  )

  it('fails the run when the provider CDN 404s', async () => {
    const persistence = memoryPersistence()
    const artifactFetch = vi.fn(
      async () => new Response('gone', { status: 404 }),
    )

    await expect(
      generateImage({
        adapter: urlImageAdapter('https://cdn.example.com/missing.png'),
        prompt: 'make an image',
        threadId: 'thread-404',
        runId: 'run-404',
        middleware: [
          withGenerationPersistence(persistence, {
            threadId: 'thread-404',
            artifactFetch,
          }),
        ],
      }),
    ).rejects.toThrow(/HTTP 404/)

    const job = await persistence.stores.generationRuns.get('run-404')
    expect(job).toMatchObject({ status: 'failed' })
  })

  it('refuses to follow a redirect on an approved input URL', async () => {
    const persistence = memoryPersistence()
    // `redirect: 'manual'` hands the 3xx back rather than chasing it, because
    // the hop target is a host neither allowInputUrl nor the internal-host
    // block ever saw.
    let init: RequestInit | undefined
    const artifactFetch = vi.fn(
      async (_input: RequestInfo | URL, options?: RequestInit) => {
        init = options
        return new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        })
      },
    )

    await expect(
      generateImage({
        adapter: imageAdapter(),
        prompt: urlPrompt('https://cdn.example.com/pixel.png'),
        threadId: 'thread-redirect',
        runId: 'run-redirect',
        middleware: [
          withGenerationPersistence(persistence, {
            threadId: 'thread-redirect',
            artifactFetch,
            allowInputUrl: ({ url }) => url.hostname === 'cdn.example.com',
          }),
        ],
      }),
    ).rejects.toThrow(/Refusing to follow a redirect for input artifact/)

    expect(artifactFetch).toHaveBeenCalledTimes(1)
    // Without this the redirect is chased before anything can inspect the hop
    // target, and the 3xx check above never gets a 3xx to see.
    expect(init?.redirect).toBe('manual')
  })
})
