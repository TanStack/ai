import { describe, expect, it, vi } from 'vitest'
import { chat, toolDefinition, type StreamChunk } from '@tanstack/ai'
import { OpenAIChatCompletionsTextAdapter } from '../src/adapters/text-chat-completions'

function sseChunks(): AsyncIterable<Record<string, unknown>> {
  const pieces = [
    {
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'create_event',
                  arguments: '{"title":"Pottery workshop in Mal',
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'gpt-4o-mini',
      choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
    },
  ]
  return {
    async *[Symbol.asyncIterator]() {
      for (const piece of pieces) yield piece
    },
  }
}

describe('issue 1853 length-cut tool call', () => {
  it('keeps finish_reason length and does not send the call again', async () => {
    const create = vi.fn(async () => sseChunks())
    const adapter = new OpenAIChatCompletionsTextAdapter(
      { apiKey: 'test-key' },
      'gpt-4o-mini',
    )
    ;(adapter as unknown as { client: unknown }).client = {
      chat: { completions: { create } },
    }

    const createEvent = toolDefinition({
      name: 'create_event',
      description: 'Create a calendar event',
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
      },
    }).server(() => ({ ok: true }))

    const events: Array<StreamChunk> = []
    for await (const event of chat({
      threadId: 'thread-1853',
      adapter,
      messages: [
        {
          role: 'user',
          content: 'Create an event for a pottery workshop.',
        },
      ],
      tools: [createEvent],
    })) {
      events.push(event)
    }

    const finished = events.filter((event) => event.type === 'RUN_FINISHED')
    const results = events.filter((event) => event.type === 'TOOL_CALL_RESULT')
    expect(create).toHaveBeenCalledTimes(1)
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({
      metadata: { tanstack: { finishReason: 'length' } },
    })
    expect(
      results.some(
        (event) =>
          event.type === 'TOOL_CALL_RESULT' &&
          typeof event.content === 'string' &&
          event.content.includes('Failed to parse tool arguments as JSON'),
      ),
    ).toBe(false)
  })
})
