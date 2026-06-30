import { EventType } from '@tanstack/ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StreamChunk, TextOptions } from '@tanstack/ai'

const analyzeStreamMock = vi.fn()
const analyzeMock = vi.fn()

vi.mock('twelvelabs-js', () => ({
  TwelveLabs: class {
    analyzeStream = analyzeStreamMock
    analyze = analyzeMock
  },
}))

import { createTwelveLabsText } from '../src/adapters/text'

function makeLogger() {
  return {
    request: vi.fn(),
    response: vi.fn(),
    provider: vi.fn(),
    errors: vi.fn(),
  } as unknown as TextOptions['logger']
}

async function* fakeStream(
  events: Array<Record<string, unknown>>,
): AsyncIterable<Record<string, unknown>> {
  for (const ev of events) yield ev
}

function videoMessageOptions(): TextOptions<any> {
  return {
    model: 'pegasus1.5',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', content: 'What happens in this video?' },
          {
            type: 'video',
            source: { type: 'url', value: 'https://example.com/clip.mp4' },
          },
        ],
      },
    ],
    logger: makeLogger(),
  }
}

async function collect(
  iter: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of iter) out.push(chunk)
  return out
}

describe('TwelveLabs Pegasus text adapter', () => {
  beforeEach(() => {
    analyzeStreamMock.mockReset()
    analyzeMock.mockReset()
  })

  it('maps a video URL + text prompt to the analyzeStream request', async () => {
    analyzeStreamMock.mockResolvedValue(
      fakeStream([
        { eventType: 'stream_start', metadata: {} },
        { eventType: 'text_generation', text: 'A dog ' },
        { eventType: 'text_generation', text: 'runs.' },
        {
          eventType: 'stream_end',
          finishReason: 'stop',
          metadata: { usage: { inputTokens: 100, outputTokens: 5 } },
        },
      ]),
    )

    const adapter = createTwelveLabsText('pegasus1.5', 'test-key')
    await collect(adapter.chatStream(videoMessageOptions()))

    expect(analyzeStreamMock).toHaveBeenCalledTimes(1)
    const req = analyzeStreamMock.mock.calls[0]![0]
    expect(req).toMatchObject({
      modelName: 'pegasus1.5',
      prompt: 'What happens in this video?',
      video: { type: 'url', url: 'https://example.com/clip.mp4' },
    })
  })

  it('emits RUN_STARTED → TEXT_MESSAGE_* → RUN_FINISHED with accumulated text and usage', async () => {
    analyzeStreamMock.mockResolvedValue(
      fakeStream([
        { eventType: 'text_generation', text: 'A dog ' },
        { eventType: 'text_generation', text: 'runs.' },
        {
          eventType: 'stream_end',
          finishReason: 'stop',
          metadata: { usage: { inputTokens: 100, outputTokens: 5 } },
        },
      ]),
    )

    const adapter = createTwelveLabsText('pegasus1.5', 'test-key')
    const chunks = await collect(adapter.chatStream(videoMessageOptions()))
    const types = chunks.map((c) => c.type)

    expect(types[0]).toBe(EventType.RUN_STARTED)
    expect(types).toContain(EventType.TEXT_MESSAGE_START)
    expect(types).toContain(EventType.TEXT_MESSAGE_END)
    expect(types[types.length - 1]).toBe(EventType.RUN_FINISHED)

    const content = chunks
      .filter((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((c) => (c as { delta: string }).delta)
      .join('')
    expect(content).toBe('A dog runs.')

    const finished = chunks[chunks.length - 1] as {
      finishReason: string
      usage?: { promptTokens?: number; completionTokens?: number }
    }
    expect(finished.finishReason).toBe('stop')
    expect(finished.usage).toMatchObject({
      promptTokens: 100,
      completionTokens: 5,
      totalTokens: 105,
    })
  })

  it('prefers modelOptions.assetId over an inline video part', async () => {
    analyzeStreamMock.mockResolvedValue(fakeStream([]))
    const adapter = createTwelveLabsText('pegasus1.5', 'test-key')

    const opts = videoMessageOptions()
    opts.modelOptions = {
      assetId: 'asset_123',
      temperature: 0.5,
      maxTokens: 1024,
    }
    await collect(adapter.chatStream(opts))

    const req = analyzeStreamMock.mock.calls[0]![0]
    expect(req.video).toEqual({ type: 'asset_id', assetId: 'asset_123' })
    expect(req.temperature).toBe(0.5)
    expect(req.maxTokens).toBe(1024)
  })

  it('emits RUN_ERROR when no video is supplied', async () => {
    const adapter = createTwelveLabsText('pegasus1.5', 'test-key')
    const chunks = await collect(
      adapter.chatStream({
        model: 'pegasus1.5',
        messages: [{ role: 'user', content: 'No video here' }],
        logger: makeLogger(),
      }),
    )
    const errorChunk = chunks.find((c) => c.type === EventType.RUN_ERROR) as
      | { message: string }
      | undefined
    expect(errorChunk).toBeDefined()
    expect(errorChunk!.message).toMatch(/requires a video/i)
    expect(analyzeStreamMock).not.toHaveBeenCalled()
  })

  it('structuredOutput sends a json_schema response format and parses the result', async () => {
    analyzeMock.mockResolvedValue({
      data: '{"summary":"a dog runs"}',
      usage: { inputTokens: 100, outputTokens: 6 },
    })
    const adapter = createTwelveLabsText('pegasus1.5', 'test-key')

    const result = await adapter.structuredOutput({
      chatOptions: videoMessageOptions(),
      outputSchema: {
        type: 'object',
        properties: { summary: { type: 'string' } },
      },
    })

    const req = analyzeMock.mock.calls[0]![0]
    expect(req.responseFormat.type).toBe('json_schema')
    expect(result.data).toEqual({ summary: 'a dog runs' })
    expect(result.rawText).toBe('{"summary":"a dog runs"}')
  })
})
