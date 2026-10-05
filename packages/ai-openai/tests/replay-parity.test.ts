import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import type { ModelMessage } from '@tanstack/ai'
import { createOpenaiChat } from '../src/adapters/text'
import { createOpenaiChatCompletions } from '../src/adapters/text-chat-completions'
import { openaiCompatible } from '../src/compatible/index'
import { webSearchTool } from '../src/tools'

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

const history: Array<ModelMessage> = [
  { role: 'user', content: 'first' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'call',
        type: 'function',
        function: { name: 'inspect', arguments: '{}' },
      },
    ],
  },
  { role: 'tool', toolCallId: 'call', content: 'done' },
  { role: 'user', content: 'next' },
]

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

  it.each([undefined, []])(
    'keeps tools[] for historical calls with current tools %j',
    async (tools) => {
      const { fetcher, bodies } = wire()
      const adapter = createOpenaiChat('gpt-5.5', 'key', { fetch: fetcher })
      for await (const _chunk of adapter.chatStream({
        logger,
        model: adapter.model,
        messages: history,
        ...(tools && { tools }),
      })) {
      }
      expect(bodies[0]?.tools).toEqual([])
      expect(bodies[0]?.input).toContainEqual({
        type: 'function_call_output',
        call_id: 'call',
        output: 'done',
      })
    },
  )

  it('keeps explicit provider tools with history', async () => {
    const { fetcher, bodies } = wire()
    const adapter = createOpenaiChat('gpt-5.5', 'key', { fetch: fetcher })
    for await (const _chunk of adapter.chatStream({
      logger,
      model: adapter.model,
      messages: history,
      tools: [webSearchTool({ type: 'web_search' })],
    })) {
    }
    expect(bodies[0]?.tools).toEqual([{ type: 'web_search' }])
    expect(bodies[0]?.include).toContain('web_search_call.action.sources')
  })

  it.each(['chat-completions', 'responses'] as const)(
    'uses the configured runtime input tuple for %s',
    (api) => {
      const provider = openaiCompatible({
        apiKey: 'key',
        baseURL: 'https://example.invalid/v1',
        api,
        models: [
          { name: 'text-only', input: ['text'] },
          { name: 'with-images', input: ['text', 'image'] },
          'bare-model',
        ],
      })
      expect(provider('text-only').inputModalities).toEqual(['text'])
      expect(provider('with-images').inputModalities).toEqual(['text', 'image'])
      expect(provider('bare-model').inputModalities).toEqual(['text', 'image'])
    },
  )
})
