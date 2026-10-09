import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import type { ModelMessage } from '@tanstack/ai'
import { createOpenaiChat } from '../src/adapters/text'
import { createOpenaiChatCompletions } from '../src/adapters/text-chat-completions'

const logger = resolveDebugOption(false)

function wire(chatCompletions = false) {
  const bodies: Array<Record<string, unknown>> = []
  const fetcher: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    const event = chatCompletions
      ? {
          id: 'response',
          model: 'resolved',
          choices: [
            { index: 0, delta: { content: 'done' }, finish_reason: 'stop' },
          ],
        }
      : {
          type: 'response.completed',
          response: {
            id: 'response',
            model: 'resolved',
            status: 'completed',
            output: [],
          },
        }
    return new Response(
      'data: ' + JSON.stringify(event) + '\n\ndata: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )
  }
  return { fetcher, bodies }
}

describe('OpenAI factory replay', () => {
  it.each([
    undefined,
    { provider: 'openai', api: 'openai-responses', model: 'gpt-5.5' },
  ])(
    'keeps the full ordinary factory request with source %j',
    async (source) => {
      const { fetcher, bodies } = wire()
      const adapter = createOpenaiChat('gpt-5.5', 'key', { fetch: fetcher })
      const messages: Array<ModelMessage> = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: 'Prior',
          ...(source && { metadata: { tanstack: { source } } }),
        },
      ]
      for await (const _chunk of adapter.chatStream({
        logger,
        model: adapter.model,
        messages,
        systemPrompts: ['System'],
        metadata: { app: 'value' },
        modelOptions: {
          max_output_tokens: 100,
          prompt_cache_key: 'explicit-cache',
          store: false,
          include: [],
          tool_choice: 'auto',
        },
      })) {
      }
      expect(bodies).toEqual([
        {
          max_output_tokens: 100,
          prompt_cache_key: 'explicit-cache',
          store: false,
          include: [],
          tool_choice: 'auto',
          model: 'gpt-5.5',
          metadata: { app: 'value' },
          instructions: 'System',
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello' }],
            },
            { type: 'message', role: 'assistant', content: 'Prior' },
          ],
          stream: true,
        },
      ])
    },
  )

  it.each([
    undefined,
    { provider: 'openai', api: 'openai-completions', model: 'gpt-5.5' },
  ])(
    'keeps the full ordinary Chat Completions factory request with source %j',
    async (source) => {
      const { fetcher, bodies } = wire(true)
      const adapter = createOpenaiChatCompletions('gpt-5.5', 'key', {
        fetch: fetcher,
      })
      const messages: Array<ModelMessage> = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: 'Prior',
          ...(source && { metadata: { tanstack: { source } } }),
        },
      ]
      const original = JSON.stringify(messages)
      for await (const _chunk of adapter.chatStream({
        logger,
        model: adapter.model,
        messages,
        systemPrompts: ['System'],
        modelOptions: { temperature: 0.2, top_p: 0.7, tool_choice: 'auto' },
      })) {
      }
      expect(bodies).toEqual([
        {
          temperature: 0.2,
          top_p: 0.7,
          tool_choice: 'auto',
          model: 'gpt-5.5',
          messages: [
            { role: 'system', content: 'System' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Prior' },
          ],
          stream: true,
          stream_options: { include_usage: true },
        },
      ])
      expect(JSON.stringify(messages)).toBe(original)
    },
  )
})
