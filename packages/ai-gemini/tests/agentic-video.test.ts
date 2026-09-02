import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import type { AdapterYieldChunk, ModelMessage } from '@tanstack/ai'
import { GeminiTextAdapter } from '../src/adapters/text'

// Mock @google/genai with both the generateContent* surface (single-pass) and
// the interactions surface (agentic), so we can assert which one a given
// message routes to.
const mocks = vi.hoisted(() => ({
  generateContentStreamSpy: vi.fn(),
  interactionsCreateSpy: vi.fn(),
}))

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<any>('@google/genai')
  const { generateContentStreamSpy, interactionsCreateSpy } = mocks
  class MockGoogleGenAI {
    public models = { generateContentStream: generateContentStreamSpy }
    get interactions() {
      return { create: interactionsCreateSpy }
    }
    constructor(_options: { apiKey: string }) {}
  }
  return { ...actual, GoogleGenAI: MockGoogleGenAI }
})

const createStream = (chunks: Array<Record<string, unknown>>) =>
  (async function* () {
    for (const chunk of chunks) yield chunk
  })()

const collect = async (stream: AsyncIterable<AdapterYieldChunk>) => {
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const videoMessage = (metadata?: Record<string, unknown>): ModelMessage => ({
  role: 'user',
  content: [
    { type: 'text', content: 'What happens in this video?' },
    {
      type: 'video',
      source: { type: 'url', value: 'files/abc', mimeType: 'video/mp4' },
      ...(metadata && { metadata }),
    },
  ],
})

describe('Gemini agentic video routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes processing:"agentic" video parts through the Interactions API', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue({
      output_text: 'A guitar is played in a store.',
    })

    const adapter = new GeminiTextAdapter({ apiKey: 'k' }, 'gemini-3.7-flash')
    const chunks = await collect(
      chat({
        adapter,
        messages: [videoMessage({ processing: 'agentic' })],
      }),
    )

    expect(mocks.interactionsCreateSpy).toHaveBeenCalledTimes(1)
    expect(mocks.generateContentStreamSpy).not.toHaveBeenCalled()

    const payload = mocks.interactionsCreateSpy.mock.calls[0]![0]
    expect(payload.model).toBe('gemini-3.7-flash')
    const videoBlock = payload.input[0].content.find(
      (c: { type: string }) => c.type === 'video',
    )
    expect(videoBlock.processing).toBe('agentic')

    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta: string }).delta)
      .join('')
    expect(text).toBe('A guitar is played in a store.')
  })

  it('routes single-pass video parts through generateContentStream', async () => {
    mocks.generateContentStreamSpy.mockResolvedValue(
      createStream([
        {
          candidates: [
            { content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' },
          ],
          usageMetadata: { totalTokenCount: 1 },
        },
      ]),
    )

    const adapter = new GeminiTextAdapter({ apiKey: 'k' }, 'gemini-3.7-flash')
    await collect(chat({ adapter, messages: [videoMessage()] }))

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    expect(mocks.interactionsCreateSpy).not.toHaveBeenCalled()
  })
})
