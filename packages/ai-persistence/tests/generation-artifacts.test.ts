import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  generateAudio,
  generateImage,
  generateTranscription,
} from '@tanstack/ai'
import { defineAIPersistence } from '../src/types'
import { memoryPersistence } from '../src/memory'
import { withGenerationPersistence } from '../src/middleware'
import type {
  GenerationArtifactDescriptor,
  GenerationArtifactExtractionInput,
  GenerationArtifactNameInput,
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

  it('fails loudly when artifact persistence is explicitly enabled but stores are missing', () => {
    const full = memoryPersistence()
    const persistence = defineAIPersistence({
      stores: {
        runs: full.stores.runs,
        publicEvents: full.stores.publicEvents,
      },
    })

    expect(() =>
      withGenerationPersistence(persistence, { features: ['artifacts', 'blobs'] }),
    ).toThrow(/artifacts.*stores\.artifacts.*blobs.*stores\.blobs/i)
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
    expect(result.artifacts?.map((artifact) => artifact.externalUrl)).toEqual([
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
      result?.value as { artifacts?: Array<PersistedArtifactRef> } | undefined
    )?.artifacts?.[0]

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

  it('does not re-persist replayed generation results', async () => {
    const persistence = memoryPersistence()
    const put = vi.spyOn(persistence.stores.blobs!, 'put')

    const result = (await generateAudio({
      adapter: audioAdapter(),
      prompt: 'ignored',
      replay: {
        result: {
          id: 'replayed',
          model: 'test-audio-model',
          audio: { b64Json: 'cmVwbGF5ZWQ=', contentType: 'audio/wav' },
        },
      },
      middleware: [withGenerationPersistence(persistence)],
    } as AudioGenerateOptions)) as AudioGenerationResult

    expect(result.artifacts).toBeUndefined()
    expect(put).not.toHaveBeenCalled()
  })

  it('does not persist generation artifacts when artifact features are disabled', async () => {
    const persistence = memoryPersistence()
    const put = vi.spyOn(persistence.stores.blobs!, 'put')
    const save = vi.spyOn(persistence.stores.artifacts!, 'save')

    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'make an image',
      threadId: 'thread-messages-only',
      runId: 'run-messages-only',
      middleware: [withGenerationPersistence(persistence, { features: ['messages'] })],
    })

    expect(result.artifacts).toBeUndefined()
    expect(put).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('fails early when artifact persistence is enabled without a paired blob store', () => {
    const full = memoryPersistence()
    const persistence = defineAIPersistence({
      stores: {
        artifacts: full.stores.artifacts,
      },
    })

    expect(() =>
      withGenerationPersistence(persistence, { features: ['artifacts'] }),
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
