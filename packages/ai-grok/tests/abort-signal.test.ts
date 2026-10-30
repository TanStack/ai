import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GrokImageAdapter } from '../src/adapters/image'
import { GrokSpeechAdapter } from '../src/adapters/tts'
import { GrokTranscriptionAdapter } from '../src/adapters/transcription'

const logger = resolveDebugOption(false)
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function mockFetch(body: unknown) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    text: () => Promise.resolve(''),
  } as Partial<Response> as Response)
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

class ImageAdapter extends GrokImageAdapter<'grok-imagine-image'> {
  spyOnGenerate() {
    return vi.spyOn(this.client.images, 'generate')
  }
}

describe('Grok media adapters forward the abort signal', () => {
  it('passes it to fetch for speech', async () => {
    const fetchMock = mockFetch({})
    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')
    const controller = new AbortController()

    await adapter.generateSpeech({
      model: 'grok-tts',
      text: 'hello',
      abortSignal: controller.signal,
      logger,
    })

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it('passes it to fetch for transcription', async () => {
    const fetchMock = mockFetch({ text: 'hello' })
    const adapter = new GrokTranscriptionAdapter(
      { apiKey: 'xai-test' },
      'grok-stt',
    )
    const controller = new AbortController()

    await adapter.transcribe({
      model: 'grok-stt',
      audio: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
      abortSignal: controller.signal,
      logger,
    })

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it('passes it to the SDK for image generation', async () => {
    const adapter = new ImageAdapter(
      { apiKey: 'xai-test' },
      'grok-imagine-image',
    )
    const generate = adapter.spyOnGenerate().mockResolvedValue({
      data: [{ url: 'https://example.test/a.png' }],
    } as never)
    const controller = new AbortController()

    await adapter.generateImages({
      model: 'grok-imagine-image',
      prompt: 'a cat',
      abortSignal: controller.signal,
      logger,
    })

    const requestOptions = generate.mock.calls[0]?.[1] as
      | { signal?: AbortSignal }
      | undefined
    expect(requestOptions?.signal).toBe(controller.signal)
  })

  it('passes it to fetch for image edits', async () => {
    const fetchMock = mockFetch({
      data: [{ url: 'https://example.test/a.png' }],
    })
    const adapter = new GrokImageAdapter(
      { apiKey: 'xai-test' },
      'grok-imagine-image',
    )
    const controller = new AbortController()

    await adapter.generateImages({
      model: 'grok-imagine-image',
      prompt: [
        { type: 'text', content: 'make it blue' },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.test/in.png' },
        },
      ],
      abortSignal: controller.signal,
      logger,
    })

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })
})
