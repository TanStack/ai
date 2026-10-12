import { describe, expect, it } from 'vitest'
import { HTTPClient } from '@openrouter/sdk'
import { EventType } from '@tanstack/ai'
import {
  hashToolCallId,
  resolveDebugOption,
  tanstackMetadata,
} from '@tanstack/ai/adapter-internals'
import type { AdapterYieldChunk, ModelMessage } from '@tanstack/ai'
import { OpenRouterTextAdapter } from '../src/adapters/text'
import { OpenRouterResponsesTextAdapter } from '../src/adapters/responses-text'

const model = 'openai/gpt-5.5'
const logger = resolveDebugOption(false)
const chatChunk = (delta: unknown = { content: 'Done' }, finish = 'stop') => ({
  id: 'generation-real',
  model: 'provider-model',
  created: 1,
  object: 'chat.completion.chunk',
  choices: [{ index: 0, delta, finish_reason: finish }],
})
const response = (text = 'Done') => ({
  id: 'generation-real',
  model: 'provider-model',
  object: 'response',
  status: 'completed',
  created_at: 1,
  completed_at: 2,
  error: null,
  incomplete_details: null,
  frequency_penalty: null,
  presence_penalty: null,
  instructions: null,
  metadata: null,
  parallel_tool_calls: false,
  temperature: null,
  top_p: null,
  tool_choice: 'auto',
  tools: [],
  output: [
    {
      type: 'message',
      id: 'message-real',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    },
  ],
})
const responseEvent = (text = 'Done') => ({
  type: 'response.completed',
  sequence_number: 1,
  response: response(text),
})
const collect = async (stream: AsyncIterable<AdapterYieldChunk>) => {
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function sdk(api: 'chat' | 'responses', events?: Array<unknown>) {
  const bodies: Array<unknown> = []
  const requests: Array<Request> = []
  const httpClient = new HTTPClient({
    fetcher: async (input) => {
      if (!(input instanceof Request)) throw new Error('Missing SDK request')
      const body = JSON.parse(await input.clone().text())
      bodies.push(body)
      requests.push(input)
      if (!body.stream)
        return new Response(
          JSON.stringify(
            api === 'chat'
              ? {
                  id: 'generation-real',
                  model: 'provider-model',
                  created: 1,
                  object: 'chat.completion',
                  system_fingerprint: null,
                  choices: [
                    {
                      index: 0,
                      finish_reason: 'stop',
                      logprobs: null,
                      message: { role: 'assistant', content: '{"ok":true}' },
                    },
                  ],
                }
              : response('{"ok":true}'),
          ),
          { headers: { 'content-type': 'application/json' } },
        )
      const chunks =
        events && bodies.length === 1
          ? events
          : api === 'chat'
            ? [chatChunk()]
            : [responseEvent()]
      return new Response(
        chunks
          .map((event) => 'data: ' + JSON.stringify(event) + '\n\n')
          .join('') + (api === 'chat' ? 'data: [DONE]\n\n' : ''),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    },
  })
  const config = {
    apiKey: 'test-key',
    httpClient,
    httpReferer: 'https://app.example',
    appTitle: 'App',
  }
  const adapter =
    api === 'chat'
      ? new OpenRouterTextAdapter(config, model)
      : new OpenRouterResponsesTextAdapter(config, model)
  return { adapter, bodies, requests, config }
}

describe('native OpenRouter replay parity', () => {
  it.each(['chat', 'responses'] as const)(
    'replays foreign ordered thinking and IDs through %s',
    async (api) => {
      const mock = sdk(api)
      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'middle',
          thinking: [
            { content: 'before', signature: 'signature-state' },
            { content: 'after', signature: 'signature-state' },
          ],
          metadata: {
            tanstack: {
              source: { provider: 'other', api: 'other', model: 'other' },
            },
          },
          toolCalls: [
            {
              id: 'call/bad|item/bad',
              type: 'function',
              function: {
                name: 'inspect',
                arguments: '{ "n":9007199254740993,"nested":{"s":"ok"} }',
              },
              metadata: { itemId: 'stale-item', namespace: 'tools' },
            },
          ],
          blockOrder: [
            { type: 'thinking', index: 0 },
            { type: 'text', length: 6 },
            { type: 'tool-call', id: 'call/bad|item/bad' },
            { type: 'thinking', index: 1 },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call/bad|item/bad',
          content: '{"n":1e999,"s":"ok"}',
        },
        {
          role: 'user',
          content: [
            { type: 'text', content: 'next😀' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://opaque.example/image' },
            },
          ],
        },
      ]
      const original = JSON.stringify(messages)
      await collect(
        mock.adapter.chatStream({
          logger,
          model,
          messages,
          systemPrompts: ['system'],
        }),
      )
      const expectedCall = api === 'chat' ? 'call_bad_item_bad' : 'call_bad'
      if (api === 'chat')
        expect(mock.bodies[0]).toMatchObject({
          messages: [
            { role: 'system', content: 'system' },
            {
              role: 'assistant',
              content: 'beforemiddleafter',
              tool_calls: [
                {
                  id: expectedCall,
                  function: {
                    name: 'inspect',
                    arguments: '{ "n":9007199254740993,"nested":{"s":"ok"} }',
                  },
                },
              ],
            },
            {
              role: 'tool',
              tool_call_id: expectedCall,
              content: '{"n":1e999,"s":"ok"}',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'next😀' },
                {
                  type: 'image_url',
                  image_url: { url: 'https://opaque.example/image' },
                },
              ],
            },
          ],
        })
      else
        expect(mock.bodies[0]).toMatchObject({
          instructions: 'system',
          input: [
            { type: 'message', role: 'assistant', content: 'beforemiddle' },
            {
              type: 'function_call',
              call_id: expectedCall,
              id: 'fc_' + hashToolCallId('item/bad'),
              arguments: '{ "n":9007199254740993,"nested":{"s":"ok"} }',
            },
            { type: 'message', role: 'assistant', content: 'after' },
            {
              type: 'function_call_output',
              call_id: expectedCall,
              output: '{"n":1e999,"s":"ok"}',
            },
            {
              type: 'message',
              role: 'user',
              content: [
                { type: 'input_text', text: 'next😀' },
                {
                  type: 'input_image',
                  image_url: 'https://opaque.example/image',
                },
              ],
            },
          ],
        })
      expect(JSON.stringify(messages)).toBe(original)
      expect(JSON.stringify(mock.bodies)).not.toContain('signature-state')
    },
  )

  it.each(['chat', 'responses'] as const)(
    'reports genuine %s identity and actual API before content',
    async (api) => {
      const mock = sdk(api)
      const chunks = await collect(
        mock.adapter.chatStream({
          logger,
          model,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      )
      const source = {
        provider: 'openrouter',
        api: api === 'chat' ? 'openai-completions' : 'openai-responses',
        model,
      }
      expect(tanstackMetadata(chunks[0])?.source).toEqual(source)
      expect(
        chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED),
      ).toMatchObject({ model: 'provider-model' })
      expect(
        tanstackMetadata(
          chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED),
        )?.responseId,
      ).toBe('generation-real')
      const result = await mock.adapter.structuredOutput({
        chatOptions: {
          logger,
          model,
          messages: [{ role: 'user', content: 'Hello' }],
        },
        outputSchema: { type: 'object' },
      })
      expect(result).toMatchObject({
        data: { ok: true },
        responseId: 'generation-real',
        model: 'provider-model',
      })
    },
  )

  it.each(['chat', 'responses'] as const)(
    'keeps the literal ordinary %s SDK body and request headers',
    async (api) => {
      for (const sameSource of [false, true]) {
        const mock = sdk(api)
        const source = {
          provider: 'openrouter',
          api: api === 'chat' ? 'openai-completions' : 'openai-responses',
          model,
        }
        const messages: Array<ModelMessage> = [
          { role: 'user', content: 'Hello' },
          {
            role: 'assistant',
            content: 'Prior',
            ...(sameSource && { metadata: { tanstack: { source } } }),
          },
        ]
        const modelOptions =
          api === 'chat'
            ? {
                temperature: 0.2,
                topP: 0.7,
                maxCompletionTokens: 100,
                tools: [
                  {
                    type: 'function' as const,
                    function: { name: 'raw', parameters: { type: 'object' } },
                  },
                ],
                toolChoice: 'auto' as const,
                metadata: { app: 'value' },
              }
            : {
                temperature: 0.2,
                topP: 0.7,
                maxOutputTokens: 100,
                tools: [
                  {
                    type: 'function' as const,
                    name: 'raw',
                    parameters: { type: 'object' },
                  },
                ],
                toolChoice: 'auto' as const,
                metadata: { app: 'value' },
                promptCacheKey: 'cache',
                prompt: { id: 'template', variables: { input: 'value' } },
              }
        await collect(
          mock.adapter.chatStream({
            logger,
            model,
            messages,
            systemPrompts: ['System'],
            modelOptions,
            request: { headers: { 'X-Trace': 'trace' } },
          }),
        )
        const controls =
          api === 'chat'
            ? {
                temperature: 0.2,
                top_p: 0.7,
                max_completion_tokens: 100,
                tools: [
                  {
                    type: 'function',
                    function: { name: 'raw', parameters: { type: 'object' } },
                  },
                ],
                tool_choice: 'auto',
                metadata: { app: 'value' },
                stream_options: { include_usage: true },
              }
            : {
                temperature: 0.2,
                top_p: 0.7,
                max_output_tokens: 100,
                tools: [
                  {
                    type: 'function',
                    name: 'raw',
                    parameters: { type: 'object' },
                  },
                ],
                tool_choice: 'auto',
                metadata: { app: 'value' },
                prompt_cache_key: 'cache',
                service_tier: 'auto',
                store: false,
                prompt: { id: 'template', variables: { input: 'value' } },
              }
        expect(mock.bodies).toEqual([
          {
            ...controls,
            model,
            stream: true,
            ...(api === 'chat'
              ? {
                  messages: [
                    { role: 'system', content: 'System' },
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Prior' },
                  ],
                }
              : {
                  instructions: 'System',
                  input: [
                    {
                      type: 'message',
                      role: 'user',
                      content: [{ type: 'input_text', text: 'Hello' }],
                    },
                    { type: 'message', role: 'assistant', content: 'Prior' },
                  ],
                }),
          },
        ])
        expect(mock.requests[0]?.headers.get('X-Trace')).toBe('trace')
        expect(mock.requests[0]?.headers.get('HTTP-Referer')).toBe(
          'https://app.example',
        )
        expect(mock.requests[0]?.headers.get('X-OpenRouter-Title')).toBe('App')
      }
    },
  )
})
