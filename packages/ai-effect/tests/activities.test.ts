import { describe, expect, expectTypeOf, it } from 'vitest'
import { Effect, Fiber, Stream } from 'effect'
import { choice } from '@tanstack/ai'
import {
  BaseEmbeddingAdapter,
  BaseImageAdapter,
  BaseVideoAdapter,
} from '@tanstack/ai/adapters'
import {
  decide,
  deleteFile,
  embed,
  generateAudio,
  generateImage,
  generateLiveVideo,
  generateSpeech,
  generateTranscription,
  generateVideo,
  generateVoice,
  generateWorld,
  getFile,
  getVideoJobStatus,
  listVoices,
  rerank,
  summarize,
  uploadFile,
} from '../src/activities'
import type {
  AudioAdapter,
  EmbeddingOptions,
  EmbeddingResult,
  EvaluateAdapter,
  FilesAdapter,
  ImageGenerationResult,
  LiveVideoAdapter,
  RerankAdapter,
  StreamChunk,
  SummarizeAdapter,
  TTSAdapter,
  TranscriptionAdapter,
  VoiceAdapter,
  WorldAdapter,
} from '@tanstack/ai'
import type { AIError } from '../src/lift'

const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
const types = { providerOptions: {} }
const threadId = 'thread-1'
const run = <A>(effect: Effect.Effect<A, AIError>) => Effect.runPromise(effect)

const imageResult: ImageGenerationResult = {
  id: 'img-1',
  model: 'm',
  images: [{ url: 'https://example.com/fox.png' }],
}

class FakeImage extends BaseImageAdapter<
  'm',
  object,
  { m: object },
  { m: '1024x1024' }
> {
  readonly name = 'fake'
  constructor() {
    super('m')
  }
  generateImages() {
    return Promise.resolve(imageResult)
  }
}

class FakeVideo extends BaseVideoAdapter<'m'> {
  readonly name = 'fake'
  constructor() {
    super({}, 'm')
  }
  createVideoJob() {
    return Promise.resolve({ jobId: 'job-1', model: 'm' })
  }
  getVideoStatus(jobId: string) {
    return Promise.resolve({ jobId, status: 'processing' as const })
  }
  getVideo(jobId: string) {
    return Promise.resolve({ jobId, url: 'https://example.com/v.mp4' })
  }
}

class HangingEmbed extends BaseEmbeddingAdapter<'m'> {
  readonly name = 'fake'
  seen: AbortSignal | undefined
  markStarted = () => {}
  started = new Promise<void>((resolve) => {
    this.markStarted = resolve
  })
  constructor() {
    super('m')
  }
  createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    this.seen = options.abortSignal
    this.markStarted()
    return new Promise(() => {})
  }
}

const files: FilesAdapter<'fake'> & { kind: 'files' } = {
  kind: 'files',
  name: 'fake',
  upload: () =>
    Promise.resolve({ id: 'file-1', provider: 'fake', mimeType: 'image/png' }),
  get: (id) => Promise.resolve({ id, provider: 'fake' }),
  delete: () => Promise.resolve(),
}

describe('generateImage', () => {
  it('returns the core result as an Effect', async () => {
    const result = await run(
      generateImage({
        adapter: new FakeImage(),
        prompt: 'A red fox',
        threadId,
      }),
    )

    expect(result).toEqual({
      id: 'img-1',
      model: 'm',
      images: [{ url: 'https://example.com/fox.png' }],
    })
  })

  it('with stream: true returns a Stream of chunks', async () => {
    const chunks = await Effect.runPromise(
      Stream.runCollect(
        generateImage({
          adapter: new FakeImage(),
          prompt: 'A red fox',
          threadId,
          stream: true,
        }),
      ),
    )

    const result = chunks.find(
      (chunk) => chunk.type === 'CUSTOM' && chunk.name === 'generation:result',
    )
    expect(result).toMatchObject({ value: { id: 'img-1' } })
    expect(chunks.at(-1)?.type).toBe('RUN_FINISHED')
  })

  it('keeps the core types: Effect by default, Stream with stream: true', () => {
    const adapter = new FakeImage()

    expectTypeOf(
      generateImage({ adapter, prompt: 'x', threadId }),
    ).toEqualTypeOf<Effect.Effect<ImageGenerationResult, AIError>>()
    expectTypeOf(
      generateImage({ adapter, prompt: 'x', threadId, stream: true }),
    ).toEqualTypeOf<Stream.Stream<StreamChunk, AIError>>()
    // @ts-expect-error the size is not one of the model's sizes
    generateImage({ adapter, prompt: 'x', threadId, size: '512x512' })
    generateImage({
      adapter,
      prompt: 'x',
      threadId,
      // @ts-expect-error the wrapper owns the abort signal
      abortSignal: AbortSignal.abort(),
    })
  })
})

describe('embed', () => {
  it('passes the abort signal to the adapter', async () => {
    const adapter = new HangingEmbed()
    const fiber = Effect.runFork(embed({ adapter, input: 'hello' }))
    await adapter.started

    await Effect.runPromise(Fiber.interrupt(fiber))

    expect(adapter.seen?.aborted).toBe(true)
  })
})

describe('smoke: each wrapper calls its core activity', () => {
  it('summarize', async () => {
    const adapter: SummarizeAdapter<'m', object> = {
      kind: 'summarize',
      name: 'fake',
      model: 'm',
      '~types': types,
      summarize: () =>
        Promise.resolve({ id: 's-1', model: 'm', summary: 'short', usage }),
    }

    const result = await run(
      summarize({ adapter, text: 'a long text', threadId }),
    )

    expect(result.summary).toBe('short')
  })

  it('rerank', async () => {
    const adapter: RerankAdapter<'m', object> = {
      kind: 'rerank',
      name: 'fake',
      model: 'm',
      '~types': types,
      rerank: () =>
        Promise.resolve({
          id: 'r-1',
          ranking: [
            { index: 1, score: 0.9 },
            { index: 0, score: 0.1 },
          ],
          usage,
        }),
    }

    const result = await run(
      rerank({ adapter, query: 'fox', documents: ['cat', 'fox'] }),
    )

    expect(result.rerankedDocuments).toEqual(['fox', 'cat'])
  })

  it('decide', async () => {
    const adapter: EvaluateAdapter<'m', object> = {
      kind: 'evaluate',
      name: 'fake',
      model: 'm',
      '~types': types,
      evaluate: () =>
        Promise.resolve({
          model: 'm',
          answers: {
            kind: {
              type: 'choice',
              choice: 'a',
              probabilities: { a: 1 },
              confidence: 1,
            },
          },
          usage,
        }),
    }

    const result = await run(
      decide({
        adapter,
        state: { text: 'hi' },
        questions: {
          kind: choice({ instructions: 'Pick one', options: { a: 'A' } }),
        },
      }),
    )

    expect(result.kind.value).toBe('a')
  })

  it('generateAudio', async () => {
    const adapter: AudioAdapter<'m', object> = {
      kind: 'audio',
      name: 'fake',
      model: 'm',
      '~types': types,
      generateAudio: () =>
        Promise.resolve({
          id: 'a-1',
          model: 'm',
          audio: { url: 'https://example.com/a.mp3' },
        }),
    }

    const result = await run(
      generateAudio({ adapter, prompt: 'rain', threadId }),
    )

    expect(result.audio).toEqual({ url: 'https://example.com/a.mp3' })
  })

  it('generateVideo and getVideoJobStatus', async () => {
    const adapter = new FakeVideo()

    const job = await run(
      generateVideo({ adapter, prompt: 'A fox runs', threadId }),
    )
    const status = await run(
      getVideoJobStatus({ adapter, jobId: job.jobId, threadId }),
    )

    expect(job.jobId).toBe('job-1')
    expect(status).toMatchObject({ jobId: 'job-1', status: 'processing' })
  })

  it('generateSpeech and listVoices', async () => {
    const adapter: TTSAdapter<'m', object> = {
      kind: 'tts',
      name: 'fake',
      model: 'm',
      '~types': types,
      generateSpeech: () =>
        Promise.resolve({
          id: 't-1',
          model: 'm',
          audio: 'AAAA',
          format: 'mp3',
        }),
      listVoices: () =>
        Promise.resolve({ voices: [{ voiceId: 'v-1', name: 'Ada' }] }),
    }

    const speech = await run(
      generateSpeech({ adapter, text: 'Hello', threadId }),
    )
    const { voices } = await run(listVoices({ adapter }))

    expect(speech.audio).toBe('AAAA')
    expect(voices).toEqual([{ voiceId: 'v-1', name: 'Ada' }])
  })

  it('generateVoice', async () => {
    const adapter: VoiceAdapter<'m', object> = {
      kind: 'voice',
      name: 'fake',
      model: 'm',
      '~types': types,
      generateVoice: () =>
        Promise.resolve({ id: 'vo-1', model: 'm', voices: [] }),
    }

    const result = await run(
      generateVoice({ adapter, prompt: 'A calm voice', threadId }),
    )

    expect(result.id).toBe('vo-1')
  })

  it('generateTranscription', async () => {
    const adapter: TranscriptionAdapter<'m', object> = {
      kind: 'transcription',
      name: 'fake',
      model: 'm',
      '~types': types,
      transcribe: () =>
        Promise.resolve({ id: 'tr-1', model: 'm', text: 'hello world' }),
    }

    const result = await run(
      generateTranscription({ adapter, audio: 'AAAA', threadId }),
    )

    expect(result.text).toBe('hello world')
  })

  it('generateWorld', async () => {
    const adapter: WorldAdapter<'m', object> = {
      kind: 'world',
      name: 'fake',
      model: 'm',
      '~types': types,
      createWorld: () =>
        Promise.resolve({
          id: 'w-1',
          model: 'm',
          prompt: 'a forest',
          status: 'ready',
        }),
    }

    const result = await run(
      generateWorld({ adapter, prompt: 'a forest', threadId }),
    )

    expect(result.id).toBe('w-1')
  })

  it('generateLiveVideo', async () => {
    const adapter: LiveVideoAdapter<'m', object> = {
      kind: 'liveVideo',
      name: 'fake',
      model: 'm',
      '~types': types,
      createLiveVideo: () =>
        Promise.resolve({
          id: 'l-1',
          model: 'm',
          token: 'tok',
          expiresAt: 1,
          prompt: 'a city',
          status: 'ready',
        }),
    }

    const result = await run(
      generateLiveVideo({ adapter, prompt: 'a city', threadId }),
    )

    expect(result.token).toBe('tok')
  })

  it('uploadFile, getFile and deleteFile', async () => {
    const handle = await run(
      uploadFile({
        adapter: files,
        input: { data: 'AAAA', mimeType: 'image/png' },
      }),
    )
    const fetched = await run(getFile({ adapter: files, id: handle }))
    const deleted = await run(deleteFile({ adapter: files, id: handle }))

    expect(handle).toEqual({
      id: 'file-1',
      provider: 'fake',
      mimeType: 'image/png',
    })
    expect(fetched).toEqual({ id: 'file-1', provider: 'fake' })
    expect(deleted).toBeUndefined()
  })
})
