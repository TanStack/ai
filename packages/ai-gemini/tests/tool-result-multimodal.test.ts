import { describe, it, expect, beforeEach, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { GeminiTextAdapter } from '../src/adapters/text'

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: { apiKey: string }) => void>(),
    generateContentSpy: vi.fn(),
    generateContentStreamSpy: vi.fn(),
    getGenerativeModelSpy: vi.fn(),
  }
})

vi.mock('@google/genai', async () => {
  const {
    constructorSpy,
    generateContentSpy,
    generateContentStreamSpy,
    getGenerativeModelSpy,
  } = mocks

  const actual = await vi.importActual<any>('@google/genai')
  class MockGoogleGenAI {
    public models = {
      generateContent: generateContentSpy,
      generateContentStream: generateContentStreamSpy,
    }

    public getGenerativeModel = getGenerativeModelSpy

    constructor(options: { apiKey: string }) {
      constructorSpy(options)
    }
  }

  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: actual.Type,
    FinishReason: actual.FinishReason,
  }
})

const createTextAdapter = () =>
  new GeminiTextAdapter({ apiKey: 'test-key' }, 'gemini-2.5-pro')

const createStream = (chunks: Array<Record<string, unknown>>) => {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk
    }
  })()
}

describe('gemini multimodal tool result', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('splits text into response.content and media into functionResponse.parts', async () => {
    const streamChunks = [
      {
        candidates: [
          {
            content: { parts: [{ text: 'ok' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { totalTokenCount: 1 },
      },
    ]

    mocks.generateContentStreamSpy.mockResolvedValue(createStream(streamChunks))

    const adapter = createTextAdapter()

    for await (const _ of chat({
      adapter,
      messages: [
        { role: 'user', content: 'look' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'shot', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: [
            { type: 'text', content: 'screenshot' },
            {
              type: 'image',
              source: { type: 'data', value: 'AAAA', mimeType: 'image/png' },
            },
          ],
        },
      ],
    })) {
      /* consume stream */
    }

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.generateContentStreamSpy.mock.calls[0]!
    const contents: Array<any> = payload.contents

    const fr = contents
      .flatMap((c: any) => c.parts ?? [])
      .find((p: any) => p.functionResponse)?.functionResponse

    expect(fr).toBeDefined()
    expect(fr.response).toEqual({ content: 'screenshot' })
    expect(fr.parts).toEqual([
      { inlineData: { data: 'AAAA', mimeType: 'image/png' } },
    ])
  })

  it('handles url-sourced media in tool results via fileData', async () => {
    const streamChunks = [
      {
        candidates: [
          {
            content: { parts: [{ text: 'ok' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { totalTokenCount: 1 },
      },
    ]

    mocks.generateContentStreamSpy.mockResolvedValue(createStream(streamChunks))

    const adapter = createTextAdapter()

    for await (const _ of chat({
      adapter,
      messages: [
        { role: 'user', content: 'look' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'fetch_image', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_2',
          content: [
            { type: 'text', content: 'result image' },
            {
              type: 'image',
              source: {
                type: 'url',
                value: 'https://example.com/image.jpg',
                mimeType: 'image/jpeg',
              },
            },
          ],
        },
      ],
    })) {
      /* consume stream */
    }

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.generateContentStreamSpy.mock.calls[0]!
    const contents: Array<any> = payload.contents

    const fr = contents
      .flatMap((c: any) => c.parts ?? [])
      .find((p: any) => p.functionResponse)?.functionResponse

    expect(fr).toBeDefined()
    expect(fr.response).toEqual({ content: 'result image' })
    expect(fr.parts).toEqual([
      {
        fileData: {
          fileUri: 'https://example.com/image.jpg',
          mimeType: 'image/jpeg',
        },
      },
    ])
  })

  it('keeps backward-compatible string content in tool results', async () => {
    const streamChunks = [
      {
        candidates: [
          {
            content: { parts: [{ text: 'ok' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { totalTokenCount: 1 },
      },
    ]

    mocks.generateContentStreamSpy.mockResolvedValue(createStream(streamChunks))

    const adapter = createTextAdapter()

    for await (const _ of chat({
      adapter,
      messages: [
        { role: 'user', content: 'look' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_3',
              type: 'function',
              function: { name: 'plain_tool', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_3',
          content: 'just a string',
        },
      ],
    })) {
      /* consume stream */
    }

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.generateContentStreamSpy.mock.calls[0]!
    const contents: Array<any> = payload.contents

    const fr = contents
      .flatMap((c: any) => c.parts ?? [])
      .find((p: any) => p.functionResponse)?.functionResponse

    expect(fr).toBeDefined()
    expect(fr.response).toEqual({ content: 'just a string' })
    expect(fr.parts).toBeUndefined()
  })
})
