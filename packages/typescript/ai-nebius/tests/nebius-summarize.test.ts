import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NebiusSummarizeAdapter } from '../src/adapters/summarize'
import type { StreamChunk } from '@tanstack/ai'

const createAdapter = <TModel extends string>(model: TModel) =>
  new NebiusSummarizeAdapter({ apiKey: 'test-key' }, model)

function createMockChatCompletionsStream(
  chunks: Array<Record<string, unknown>>,
): AsyncIterable<Record<string, unknown>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

describe('Nebius Summarize Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('summarize', () => {
    it('generates a summary using the text adapter', async () => {
      const mockStream = createMockChatCompletionsStream([
        {
          id: 'chatcmpl-123',
          model: 'deepseek-ai/DeepSeek-R1-0528',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'This is a summary.' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'deepseek-ai/DeepSeek-R1-0528',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 5,
            total_tokens: 105,
          },
        },
      ])

      const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('deepseek-ai/DeepSeek-R1-0528')
      // Mock the internal text adapter's client
      const textAdapter = (adapter as any).textAdapter
      ;(textAdapter as any).client = {
        chat: {
          completions: {
            create: chatCompletionsCreate,
          },
        },
      }

      const result = await adapter.summarize({
        model: 'deepseek-ai/DeepSeek-R1-0528',
        text: 'This is a long article about AI and machine learning. It discusses various topics including neural networks, deep learning, and natural language processing.',
        style: 'concise',
        maxLength: 100,
      })

      expect(result.summary).toBe('This is a summary.')
      expect(result.model).toBe('deepseek-ai/DeepSeek-R1-0528')
    })

    it('applies correct summarization prompt for bullet-points style', async () => {
      const mockStream = createMockChatCompletionsStream([
        {
          id: 'chatcmpl-123',
          model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '• Point 1\n• Point 2' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        },
      ])

      const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('meta-llama/Meta-Llama-3.1-70B-Instruct')
      const textAdapter = (adapter as any).textAdapter
      ;(textAdapter as any).client = {
        chat: {
          completions: {
            create: chatCompletionsCreate,
          },
        },
      }

      await adapter.summarize({
        model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
        text: 'Long text here...',
        style: 'bullet-points',
      })

      expect(chatCompletionsCreate).toHaveBeenCalledTimes(1)
      const [payload] = chatCompletionsCreate.mock.calls[0]

      // Verify system prompt includes bullet point instruction
      const systemMessage = payload.messages.find(
        (m: Record<string, unknown>) => m.role === 'system',
      )
      expect(systemMessage).toBeDefined()
      expect(systemMessage.content).toContain('bullet point')
    })

    it('applies focus areas in the prompt', async () => {
      const mockStream = createMockChatCompletionsStream([
        {
          id: 'chatcmpl-123',
          model: 'Qwen/Qwen2.5-72B-Instruct',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Summary with focus' },
              finish_reason: 'stop',
            },
          ],
        },
      ])

      const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('Qwen/Qwen2.5-72B-Instruct')
      const textAdapter = (adapter as any).textAdapter
      ;(textAdapter as any).client = {
        chat: {
          completions: {
            create: chatCompletionsCreate,
          },
        },
      }

      await adapter.summarize({
        model: 'Qwen/Qwen2.5-72B-Instruct',
        text: 'Long text about multiple topics...',
        focus: ['technology', 'innovation'],
      })

      expect(chatCompletionsCreate).toHaveBeenCalledTimes(1)
      const [payload] = chatCompletionsCreate.mock.calls[0]

      // Verify focus areas are in the system prompt
      const systemMessage = payload.messages.find(
        (m: Record<string, unknown>) => m.role === 'system',
      )
      expect(systemMessage.content).toContain('technology')
      expect(systemMessage.content).toContain('innovation')
    })
  })

  describe('summarizeStream', () => {
    it('streams summary content', async () => {
      const mockStream = createMockChatCompletionsStream([
        {
          id: 'chatcmpl-123',
          model: 'deepseek-ai/DeepSeek-R1-0528',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'This ' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'deepseek-ai/DeepSeek-R1-0528',
          choices: [
            {
              index: 0,
              delta: { content: 'is a summary.' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          model: 'deepseek-ai/DeepSeek-R1-0528',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        },
      ])

      const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('deepseek-ai/DeepSeek-R1-0528')
      const textAdapter = (adapter as any).textAdapter
      ;(textAdapter as any).client = {
        chat: {
          completions: {
            create: chatCompletionsCreate,
          },
        },
      }

      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.summarizeStream({
        model: 'deepseek-ai/DeepSeek-R1-0528',
        text: 'Long text to summarize...',
        style: 'paragraph',
      })) {
        chunks.push(chunk)
      }

      // Should have content chunks plus done chunk
      expect(chunks.length).toBeGreaterThanOrEqual(2)

      // Find content chunks
      const contentChunks = chunks.filter((c) => c.type === 'content')
      expect(contentChunks.length).toBe(2)

      // Verify accumulated content
      const lastContentChunk = contentChunks[contentChunks.length - 1]
      if (lastContentChunk.type === 'content') {
        expect(lastContentChunk.content).toBe('This is a summary.')
      }

      // Verify done chunk
      const doneChunk = chunks.find((c) => c.type === 'done')
      expect(doneChunk).toBeDefined()
    })
  })
})
