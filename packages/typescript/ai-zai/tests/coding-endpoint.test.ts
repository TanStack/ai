import { describe, expect, it } from 'vitest'
import type { StreamChunk } from '@tanstack/ai'
import { createZAIChat } from '../src/adapters'
import { ZAI_GENERAL_BASE_URL, ZAI_CODING_BASE_URL } from '../src/utils/client'

const apiKey = process.env.ZAI_API_KEY_TEST
const describeIfKey = apiKey ? describe : describe.skip

function createNoopLogger() {
  return {
    request: () => {},
    provider: () => {},
    output: () => {},
    middleware: () => {},
    tools: () => {},
    agentLoop: () => {},
    config: () => {},
    errors: () => {},
  }
}

async function collectStream(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) {
    chunks.push(chunk)
    if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') break
  }
  return chunks
}

function fullTextFromChunks(chunks: Array<StreamChunk>): string {
  const contentChunks = chunks.filter(
    (c): c is Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }> =>
      c.type === 'TEXT_MESSAGE_CONTENT',
  )
  const last = contentChunks.at(-1)
  return (last as any)?.content ?? ''
}

function lastChunk(chunks: Array<StreamChunk>): StreamChunk | undefined {
  return chunks.at(-1)
}

describeIfKey('Z.AI Coding Endpoint', () => {
  const timeout = 60_000

  it(
    `coding: true connects to ${ZAI_CODING_BASE_URL} and streams text`,
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!, { coding: true })

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [
            {
              role: 'user',
              content: 'What is 2+2? Reply with just the number.',
            },
          ],
          temperature: 0,
          // Coding plan models use reasoning tokens internally — need enough headroom
          maxTokens: 256,
          logger: createNoopLogger() as any,
        }),
      )

      const types = chunks.map((c) => c.type)
      expect(types).toContain('RUN_STARTED')
      expect(types).toContain('RUN_FINISHED')
      expect(types).not.toContain('RUN_ERROR')

      // With enough tokens, the model produces visible text content
      expect(types).toContain('TEXT_MESSAGE_START')
      expect(
        types.filter((t) => t === 'TEXT_MESSAGE_CONTENT').length,
      ).toBeGreaterThan(0)
      expect(types).toContain('TEXT_MESSAGE_END')

      const full = fullTextFromChunks(chunks)
      expect(typeof full).toBe('string')
      expect(full.length).toBeGreaterThan(0)
    },
    timeout,
  )

  it(
    'explicit baseURL resolves to coding endpoint',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!, {
        baseURL: ZAI_CODING_BASE_URL,
      })

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [
            {
              role: 'user',
              content: 'What is 3+3? Reply with just the number.',
            },
          ],
          temperature: 0,
          maxTokens: 256,
          logger: createNoopLogger() as any,
        }),
      )

      expect(lastChunk(chunks)?.type).toBe('RUN_FINISHED')
      expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)
      const full = fullTextFromChunks(chunks)
      expect(typeof full).toBe('string')
      expect(full.length).toBeGreaterThan(0)
    },
    timeout,
  )

  it(
    'general endpoint rejects coding-only API key with 429',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!)

      await expect(
        collectStream(
          adapter.chatStream({
            model: 'glm-4.7',
            messages: [{ role: 'user', content: 'Hi' }],
            maxTokens: 16,
            logger: createNoopLogger() as any,
          }),
        ),
      ).rejects.toThrow(/429|Insufficient balance/i)
    },
    timeout,
  )

  it(
    'tool calling works on coding endpoint',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!, { coding: true })

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          systemPrompts: [
            'You must call the provided tool. Do not answer with normal text.',
          ],
          messages: [
            {
              role: 'user',
              content: 'Call echo with {"text":"hello"} and nothing else.',
            },
          ],
          tools: [
            {
              name: 'echo',
              description: 'Echo back the provided text',
              inputSchema: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
              },
            },
          ],
          temperature: 0,
          maxTokens: 256,
          logger: createNoopLogger() as any,
        }),
      )

      const types = chunks.map((c) => c.type)
      expect(types).toContain('TOOL_CALL_START')
      expect(types).toContain('TOOL_CALL_END')
      expect(lastChunk(chunks)?.type).toBe('RUN_FINISHED')

      const done = chunks.find((c) => c.type === 'RUN_FINISHED') as any
      expect(done.finishReason).toBe('tool_calls')
    },
    timeout,
  )
})
