import { renderHook } from '@solidjs/testing-library'
import { EventType } from '@tanstack/ai/client'
import { createSignal, flush } from 'solid-js'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { VideoGenerationClient } from '@tanstack/ai-client'
import type { ConnectConnectionAdapter } from '@tanstack/ai-client'

const lifecycle = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}))
vi.mock('@tanstack/ai-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/ai-client')>()
  return {
    ...actual,
    VideoGenerationClient: class extends actual.VideoGenerationClient<unknown> {
      constructor(
        options: ConstructorParameters<typeof actual.VideoGenerationClient>[0],
      ) {
        super(options)
        const subscribe = this.subscribe
        this.subscribe = (listener) => {
          lifecycle.subscribe()
          listener()
          const stop = subscribe(listener)
          return () => {
            lifecycle.unsubscribe()
            stop()
          }
        }
      }
    },
  }
})

async function load<T>(path: string): Promise<T | undefined> {
  try {
    return await vi.importActual<T>(path)
  } catch {
    return undefined
  }
}

describe('Solid 2 media hooks', () => {
  it('generates images with typed transform output', async () => {
    const module = await load<typeof import('../src/use-generate-image')>(
      '../src/use-generate-image',
    )
    expect(module?.useGenerateImage).toBeTypeOf('function')
    if (!module) return
    const { result, cleanup } = renderHook(() =>
      module.useGenerateImage({
        threadId: 'image',
        fetcher: async () => ({
          id: 'image',
          model: 'test',
          images: [{ url: '/image.png' }],
        }),
        onResult: (raw) => raw.images[0]?.url,
      }),
    )
    flush()
    expectTypeOf(result.result()).toEqualTypeOf<string | null>()
    await result.generate({ prompt: 'image' })
    flush()
    expect(result.result()).toBe('/image.png')
    cleanup()
  })

  it('generates audio with typed transform output', async () => {
    const module = await load<typeof import('../src/use-generate-audio')>(
      '../src/use-generate-audio',
    )
    expect(module?.useGenerateAudio).toBeTypeOf('function')
    if (!module) return
    const { result, cleanup } = renderHook(() =>
      module.useGenerateAudio({
        threadId: 'audio',
        fetcher: async () => ({
          id: 'audio',
          model: 'test',
          audio: { url: '/music.mp3' },
        }),
        onResult: (raw) => raw.audio.url,
      }),
    )
    flush()
    expectTypeOf(result.result()).toEqualTypeOf<string | null>()
    await result.generate({ prompt: 'music' })
    flush()
    expect(result.result()).toBe('/music.mp3')
    cleanup()
  })

  it('generates speech with typed transform output', async () => {
    const module = await load<typeof import('../src/use-generate-speech')>(
      '../src/use-generate-speech',
    )
    expect(module?.useGenerateSpeech).toBeTypeOf('function')
    if (!module) return
    const { result, cleanup } = renderHook(() =>
      module.useGenerateSpeech({
        threadId: 'speech',
        fetcher: async () => ({
          id: 'speech',
          model: 'test',
          audio: 'AQID',
          format: 'mp3',
          contentType: 'audio/mpeg',
        }),
        onResult: (raw) => raw.audio,
      }),
    )
    flush()
    expectTypeOf(result.result()).toEqualTypeOf<string | null>()
    await result.generate({ text: 'hello' })
    flush()
    expect(result.result()).toBe('AQID')
    cleanup()
  })

  it('transcribes audio with typed transform output', async () => {
    const module = await load<typeof import('../src/use-transcription')>(
      '../src/use-transcription',
    )
    expect(module?.useTranscription).toBeTypeOf('function')
    if (!module) return
    const { result, cleanup } = renderHook(() =>
      module.useTranscription({
        threadId: 'transcription',
        fetcher: async () => ({
          id: 'transcription',
          model: 'test',
          text: 'hello',
        }),
        onResult: (raw) => raw.text,
      }),
    )
    flush()
    expectTypeOf(result.result()).toEqualTypeOf<string | null>()
    await result.generate({ audio: 'AQID' })
    flush()
    expect(result.result()).toBe('hello')
    cleanup()
  })

  it('summarizes text with typed transform output', async () => {
    const module = await load<typeof import('../src/use-summarize')>(
      '../src/use-summarize',
    )
    expect(module?.useSummarize).toBeTypeOf('function')
    if (!module) return
    const { result, cleanup } = renderHook(() =>
      module.useSummarize({
        threadId: 'summary',
        fetcher: async () => ({
          id: 'summary',
          model: 'test',
          summary: 'short',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        }),
        onResult: (raw) => raw.summary,
      }),
    )
    flush()
    expectTypeOf(result.result()).toEqualTypeOf<string | null>()
    await result.generate({ text: 'long text' })
    flush()
    expect(result.result()).toBe('short')
    cleanup()
  })

  it('updates and clears reactive body at the video transport boundary', async () => {
    const module = await load<typeof import('../src/use-generate-video')>(
      '../src/use-generate-video',
    )
    expect(module?.useGenerateVideo).toBeTypeOf('function')
    if (!module) return
    const requests = vi.fn()
    const connection: ConnectConnectionAdapter = {
      async *connect(_messages, data) {
        requests(data)
        yield {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: { jobId: 'video', status: 'completed', url: '/video.mp4' },
        }
        yield { type: EventType.RUN_FINISHED, threadId: 'video', runId: 'run' }
      },
    }
    const { result, cleanup } = renderHook(() => {
      const [body, setBody] = createSignal<{ model: string } | undefined>({
        model: 'first',
      })
      const video = module.useGenerateVideo({
        threadId: 'video',
        connection,
        get body() {
          return body()
        },
      })
      return { video, setBody }
    })
    flush()
    await result.video.generate({ prompt: 'first' })
    expect(requests).toHaveBeenLastCalledWith({
      model: 'first',
      prompt: 'first',
    })
    result.setBody({ model: 'second' })
    flush()
    await result.video.generate({ prompt: 'second' })
    expect(requests).toHaveBeenLastCalledWith({
      model: 'second',
      prompt: 'second',
    })
    result.setBody(undefined)
    flush()
    await result.video.generate({ prompt: 'cleared' })
    expect(requests).toHaveBeenLastCalledWith({ prompt: 'cleared' })
    cleanup()
  })

  it('subscribes video outside setup, updates options, and cleans up', async () => {
    const module = await load<typeof import('../src/use-generate-video')>(
      '../src/use-generate-video',
    )
    expect(module?.useGenerateVideo).toBeTypeOf('function')
    if (!module) return
    const { subscribe, unsubscribe } = lifecycle
    subscribe.mockClear()
    unsubscribe.mockClear()
    const dispose = vi.spyOn(VideoGenerationClient.prototype, 'dispose')
    const update = vi.spyOn(VideoGenerationClient.prototype, 'updateOptions')
    const { result, cleanup } = renderHook(() => {
      const [body, setBody] = createSignal({ model: 'first' })
      const video = module.useGenerateVideo({
        threadId: 'video',
        get body() {
          return body()
        },
        fetcher: async () => ({
          jobId: 'video',
          status: 'completed',
          url: '/video.mp4',
        }),
        onResult: (raw) => raw.url,
      })
      expect(subscribe).not.toHaveBeenCalled()
      expect(video.jobId()).toBeNull()
      return { video, setBody }
    })
    flush()
    expect(subscribe).toHaveBeenCalledOnce()
    result.setBody({ model: 'second' })
    flush()
    expect(update).toHaveBeenLastCalledWith({ body: { model: 'second' } })
    expectTypeOf(result.video.result()).toEqualTypeOf<string | null>()
    await result.video.generate({ prompt: 'video' })
    flush()
    expect(result.video.result()).toBe('/video.mp4')
    result.video.reset()
    expect(result.video.status()).toBe('success')
    flush()
    expect(result.video.status()).toBe('idle')
    cleanup()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })
})
