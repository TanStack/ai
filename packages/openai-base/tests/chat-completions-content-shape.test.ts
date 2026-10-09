import { describe, it, expect, vi } from 'vitest'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import OpenAI from 'openai'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import type { AdapterYieldChunk } from '@tanstack/ai'

const testLogger = resolveDebugOption(false)

class TestAdapter extends OpenAIBaseChatCompletionsTextAdapter<string> {
  constructor(chunks: Array<Record<string, unknown>>) {
    const client = new OpenAI({ apiKey: 'test-api-key' })
    client.chat.completions.create = vi.fn(async () => ({
      async *[Symbol.asyncIterator]() {
        yield* chunks
      },
    })) as unknown as typeof client.chat.completions.create
    super('test-model', 'openai-base', client)
  }
}

async function run(content: unknown) {
  const adapter = new TestAdapter([
    {
      id: 'chatcmpl-1',
      model: 'test-model',
      choices: [
        {
          delta: {
            content,
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    },
  ])
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of adapter.chatStream({
    logger: testLogger,
    model: 'test-model',
    messages: [{ role: 'user', content: 'Look it up' }],
    tools: [{ name: 'lookup', description: 'Look up' }],
  })) {
    chunks.push(chunk)
  }
  return chunks
}

describe('Chat Completions delta.content shape', () => {
  it.each([null, undefined])(
    'adds no text and keeps the tool call when content is %s',
    async (content) => {
      const chunks = await run(content)
      expect(chunks.some((c) => c.type === EventType.TEXT_MESSAGE_START)).toBe(
        false,
      )
      expect(chunks.some((c) => c.type === EventType.TOOL_CALL_END)).toBe(true)
      expect(
        chunks.find((c) => c.type === EventType.RUN_FINISHED),
      ).toMatchObject({ finishReason: 'tool_calls' })
    },
  )

  it.each([{ text: 'hi' }, [{ type: 'text', text: 'hi' }]])(
    'emits RUN_ERROR and no text for non-string content %j',
    async (content) => {
      const chunks = await run(content)
      expect(
        chunks.flatMap((c) =>
          c.type === EventType.TEXT_MESSAGE_CONTENT ? [c.content] : [],
        ),
      ).toEqual([])
      expect(chunks.find((c) => c.type === EventType.RUN_ERROR)).toMatchObject({
        message: `invalid choices[0].delta.content: expected a string, null, or an omitted field; received ${Array.isArray(content) ? 'an array' : 'an object'}`,
      })
      expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
    },
  )
})
