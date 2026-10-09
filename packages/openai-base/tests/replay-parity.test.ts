import { describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { chat, EventType } from '@tanstack/ai'
import type { AdapterYieldChunk, ModelMessage } from '@tanstack/ai'
import {
  resolveDebugOption,
  hashToolCallId,
} from '@tanstack/ai/adapter-internals'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'

class Completions extends OpenAIBaseChatCompletionsTextAdapter<string> {
  constructor(client: OpenAI, images = true) {
    super(model, 'openai', client)
    this.inputModalities = images ? ['text', 'image'] : ['text']
  }
  override readonly inputModalities: ReadonlyArray<'text' | 'image'>
}

class Responses extends OpenAIBaseResponsesTextAdapter<string> {
  constructor(client: OpenAI) {
    super(model, 'openai', client)
  }
}

function sdk(events: Array<unknown>, responses = false, firstOnly = false) {
  const bodies: Array<unknown> = []
  const requests: Array<RequestInit | undefined> = []
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    bodies.push(body)
    requests.push(init)
    if (!body.stream)
      return new Response(JSON.stringify(events[0]), {
        headers: { 'content-type': 'application/json' },
      })
    return new Response(
      (firstOnly && bodies.length > 1
        ? [responses ? responseCompleted : completed]
        : events
      )
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join('') + (responses ? '' : 'data: [DONE]\n\n'),
      {
        headers: { 'content-type': 'text/event-stream' },
      },
    )
  }
  const client = new OpenAI({ apiKey: 'test-key', fetch: fetcher })
  const completionsCreate = vi.spyOn(client.chat.completions, 'create')
  const responsesCreate = vi.spyOn(client.responses, 'create')
  return { client, bodies, requests, completionsCreate, responsesCreate }
}

async function collect(stream: AsyncIterable<AdapterYieldChunk>) {
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const completed = {
  id: 'response-1',
  model: 'resolved-model',
  choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }],
}
const responseCompleted = {
  type: 'response.completed',
  response: {
    id: 'response-1',
    model: 'resolved-model',
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'message-1',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Done', annotations: [] }],
      },
    ],
  },
}

describe('OpenAI replay parity', () => {
  it.each(
    (['shell', 'apply_patch', 'local_shell'] as const).flatMap((name) =>
      [false, true].map((sameSource) => ({ name, sameSource })),
    ),
  )(
    'keeps the literal native $name body for sameSource=$sameSource',
    async ({ name, sameSource }) => {
      const mock = sdk([responseCompleted], true)
      const args =
        name === 'shell'
          ? { commands: ['echo hello'] }
          : name === 'local_shell'
            ? { command: ['echo', 'hello'] }
            : { operation: { type: 'delete_file', path: 'file.txt' } }
      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: null,
          ...(sameSource && {
            metadata: {
              tanstack: {
                source: { provider: 'openai', api: 'openai-responses', model },
              },
            },
          }),
          toolCalls: [
            {
              id: 'native-call',
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
              metadata: {
                openaiUserTool: name,
                itemId: 'native/item',
                maxOutputLength: 123,
              },
            },
          ],
        },
        { role: 'tool', toolCallId: 'native-call', content: '{"output":"ok"}' },
      ]
      const original = JSON.stringify(messages)
      await collect(
        new Responses(mock.client).chatStream({ logger, model, messages }),
      )
      const call =
        name === 'shell'
          ? {
              type: 'shell_call',
              call_id: 'native-call',
              id: 'native/item',
              status: 'completed',
              action: {
                commands: ['echo hello'],
                max_output_length: null,
                timeout_ms: null,
              },
            }
          : name === 'local_shell'
            ? {
                type: 'local_shell_call',
                id: 'native/item',
                call_id: 'native-call',
                status: 'completed',
                action: {
                  type: 'exec',
                  command: ['echo', 'hello'],
                  env: {},
                  timeout_ms: null,
                },
              }
            : {
                type: 'apply_patch_call',
                call_id: 'native-call',
                id: 'native/item',
                status: 'completed',
                operation: { type: 'delete_file', path: 'file.txt' },
              }
      const output =
        name === 'shell'
          ? {
              type: 'shell_call_output',
              call_id: 'native-call',
              output: [
                {
                  stdout: '{"output":"ok"}',
                  stderr: '',
                  outcome: { type: 'exit', exit_code: 0 },
                },
              ],
              max_output_length: 123,
            }
          : name === 'local_shell'
            ? {
                type: 'local_shell_call_output',
                id: 'native-call',
                output: 'ok',
                status: 'completed',
              }
            : {
                type: 'apply_patch_call_output',
                call_id: 'native-call',
                status: 'completed',
                output: 'ok',
              }
      expect(mock.bodies).toEqual([
        { model, input: [call, output], stream: true },
      ])
      expect(JSON.stringify(messages)).toBe(original)
    },
  )

  it.each(
    (['shell', 'apply_patch', 'local_shell'] as const).flatMap((name) =>
      ['provider', 'api', 'model'].map((difference) => ({ name, difference })),
    ),
  )(
    'normalizes foreign native $name item IDs for a $difference mismatch',
    async ({ name, difference }) => {
      const origin = {
        provider: difference === 'provider' ? 'other' : 'openai',
        api: difference === 'api' ? 'other' : 'openai-responses',
        model: difference === 'model' ? 'other' : model,
      }
      const ids = [
        'call/bad|native/item',
        'metadata/call',
        'call?bad|native?item',
        `${'c'.repeat(90)}|${'i'.repeat(90)}`,
      ]
      const args =
        name === 'shell'
          ? { commands: ['echo hello'] }
          : name === 'local_shell'
            ? { command: ['echo', 'hello'] }
            : { operation: { type: 'delete_file', path: 'file.txt' } }
      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: null,
          metadata: { tanstack: { source: origin } },
          toolCalls: ids.map((id) => ({
            id,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
            metadata: {
              openaiUserTool: name,
              itemId: id === 'metadata/call' ? 'metadata/item' : 'stale/item',
              maxOutputLength: 123,
              namespace: 'custom',
            },
          })),
        },
        ...ids.map(
          (id): ModelMessage => ({
            role: 'tool',
            toolCallId: id,
            content: '{"output":"ok"}',
          }),
        ),
      ]
      const original = JSON.stringify(messages)
      for (const structured of [false, true]) {
        const mock = sdk(
          structured
            ? [
                {
                  ...responseCompleted.response,
                  output: [
                    {
                      type: 'message',
                      id: 'msg',
                      role: 'assistant',
                      content: [
                        {
                          type: 'output_text',
                          text: '{"ok":true}',
                          annotations: [],
                        },
                      ],
                    },
                  ],
                },
              ]
            : [responseCompleted],
          true,
        )
        const adapter = new Responses(mock.client)
        if (structured)
          await adapter.structuredOutput({
            chatOptions: { logger, model, messages },
            outputSchema: { type: 'object' },
          })
        else await collect(adapter.chatStream({ logger, model, messages }))
        const body = mock.bodies[0]
        if (
          typeof body !== 'object' ||
          body === null ||
          !('input' in body) ||
          !Array.isArray(body.input)
        )
          throw new Error('Missing request input')
        const calls = body.input.filter((item) => item.type === `${name}_call`)
        const outputs = body.input.filter(
          (item) => item.type === `${name}_call_output`,
        )
        expect(calls).toHaveLength(4)
        expect(outputs).toHaveLength(4)
        expect(calls[0].call_id).toBe('call_bad')
        expect(calls[0].id).toBe(
          difference === 'model'
            ? 'fc_native_item'
            : `fc_${hashToolCallId('native/item')}`,
        )
        expect(calls[1].id).toBe(
          difference === 'model'
            ? 'fc_metadata_item'
            : `fc_${hashToolCallId('metadata/item')}`,
        )
        expect(new Set(calls.map((item) => item.id)).size).toBe(4)
        expect(new Set(calls.map((item) => item.call_id)).size).toBe(4)
        for (const [index, call] of calls.entries()) {
          expect(call.id).toMatch(/^fc_[a-zA-Z0-9_-]+$/)
          expect(call.id.length).toBeLessThanOrEqual(64)
          expect(call.call_id.length).toBeLessThanOrEqual(64)
          expect(
            name === 'local_shell' ? outputs[index].id : outputs[index].call_id,
          ).toBe(call.call_id)
          if (name === 'shell')
            expect(outputs[index].max_output_length).toBe(123)
        }
        expect(JSON.stringify(messages)).toBe(original)
      }
    },
  )

  it.each(['shell', 'apply_patch', 'local_shell'] as const)(
    'keeps supported foreign blocks ordered beside an omitted provider item and %s',
    async (name) => {
      const mock = sdk([responseCompleted], true)
      const args =
        name === 'shell'
          ? { commands: ['echo hello'] }
          : name === 'local_shell'
            ? { command: ['echo', 'hello'] }
            : { operation: { type: 'delete_file', path: 'file.txt' } }
      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'Middle',
          thinking: [
            { content: 'before', signature: 'opaque-before' },
            { content: 'after', signature: 'opaque-after' },
          ],
          metadata: {
            tanstack: {
              source: { provider: 'other', api: 'other', model: 'other' },
            },
          },
          toolCalls: [
            {
              id: 'ws_old',
              type: 'function',
              function: { name: 'web_search', arguments: '{}' },
              metadata: {
                providerExecuted: true,
                openai: {
                  webSearchCall: {
                    id: 'ws_old',
                    type: 'web_search_call',
                    status: 'completed',
                    action: { type: 'search', query: 'query' },
                  },
                  assistantMessage: {
                    id: 'msg_old',
                    role: 'assistant',
                    type: 'message',
                    content: [
                      {
                        type: 'output_text',
                        text: 'opaque-old',
                        annotations: [],
                      },
                    ],
                  },
                },
              },
            },
            {
              id: 'ordinary',
              type: 'function',
              function: { name: 'inspect', arguments: '{}' },
              metadata: { namespace: 'tools' },
            },
            {
              id: 'native',
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
              metadata: { openaiUserTool: name },
            },
          ],
          blockOrder: [
            { type: 'thinking', index: 0 },
            { type: 'tool-call', id: 'ws_old' },
            { type: 'text', length: 6 },
            { type: 'tool-call', id: 'ordinary' },
            { type: 'tool-call', id: 'native' },
            { type: 'thinking', index: 1 },
          ],
        },
        { role: 'tool', toolCallId: 'ordinary', content: 'ok' },
        { role: 'tool', toolCallId: 'native', content: '{"output":"ok"}' },
      ]
      const original = JSON.stringify(messages)
      await collect(
        new Responses(mock.client).chatStream({ logger, model, messages }),
      )
      expect(mock.bodies[0]).toMatchObject({
        input: [
          { type: 'message', role: 'assistant', content: 'before' },
          { type: 'message', role: 'assistant', content: 'Middle' },
          { type: 'function_call', call_id: 'ordinary' },
          { type: `${name}_call`, call_id: 'native' },
          { type: 'message', role: 'assistant', content: 'after' },
          { type: 'function_call_output', call_id: 'ordinary' },
          name === 'local_shell'
            ? { type: 'local_shell_call_output', id: 'native' }
            : { type: `${name}_call_output`, call_id: 'native' },
        ],
      })
      expect(JSON.stringify(mock.bodies[0])).not.toMatch(
        /ws_old|msg_old|opaque/,
      )
      expect(JSON.stringify(messages)).toBe(original)
    },
  )

  it('omits foreign raw web-search items after removing their reasoning pair', async () => {
    const mock = sdk([responseCompleted], true)
    await collect(
      new Responses(mock.client).chatStream({
        logger,
        model,
        messages: [
          {
            role: 'assistant',
            content: 'Search answer',
            metadata: {
              tanstack: {
                source: { provider: 'other', api: 'openai-responses', model },
              },
            },
            thinking: [
              {
                content: 'Search thought',
                signature: JSON.stringify({
                  id: 'rs_old',
                  encrypted_content: 'opaque',
                }),
              },
            ],
            toolCalls: [
              {
                id: 'ws_old',
                type: 'function',
                function: { name: 'web_search', arguments: '{}' },
                metadata: {
                  providerExecuted: true,
                  openai: {
                    webSearchCall: {
                      id: 'ws_old',
                      type: 'web_search_call',
                      status: 'completed',
                      action: { type: 'search', query: 'query' },
                    },
                  },
                },
              },
            ],
          },
        ],
      }),
    )
    expect(mock.bodies[0]).toMatchObject({
      input: [
        {
          type: 'message',
          role: 'assistant',
          content: 'Search thoughtSearch answer',
        },
      ],
    })
    expect(JSON.stringify(mock.bodies[0])).not.toContain('ws_old')
    expect(JSON.stringify(mock.bodies[0])).not.toContain('rs_old')
  })
  it.each(['completions', 'responses'] as const)(
    'keeps native structured identity from %s',
    async (api) => {
      const native =
        api === 'completions'
          ? {
              id: 'response-json',
              model: 'resolved-json',
              choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
            }
          : {
              id: 'response-json',
              model: 'resolved-json',
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: '{}' }],
                },
              ],
            }
      const mock = sdk([native], api === 'responses')
      const adapter =
        api === 'completions'
          ? new Completions(mock.client)
          : new Responses(mock.client)
      expect(
        await adapter.structuredOutput({
          chatOptions: {
            logger,
            model,
            messages: [{ role: 'user', content: 'JSON' }],
          },
          outputSchema: { type: 'object', properties: {} },
        }),
      ).toMatchObject({
        responseId: 'response-json',
        model: 'resolved-json',
        rawText: '{}',
      })
    },
  )

  it.each(['completions', 'responses'] as const)(
    'omits missing native response identity from %s',
    async (api) => {
      const native =
        api === 'completions'
          ? { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }
          : {
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: '{}' }],
                },
              ],
            }
      const mock = sdk([native], api === 'responses')
      const adapter =
        api === 'completions'
          ? new Completions(mock.client)
          : new Responses(mock.client)
      const result = await adapter.structuredOutput({
        chatOptions: {
          logger,
          model,
          messages: [{ role: 'user', content: 'JSON' }],
        },
        outputSchema: { type: 'object', properties: {} },
      })
      expect(result.responseId).toBeUndefined()
      expect(result.model).toBeUndefined()
    },
  )

  it.each(['completions', 'responses'] as const)(
    'tags request failures before content with actual %s source',
    async (api) => {
      const fetcher: typeof fetch = async () => {
        throw new Error('failed')
      }
      const client = new OpenAI({
        apiKey: 'test-key',
        fetch: fetcher,
        maxRetries: 0,
      })
      const adapter =
        api === 'completions' ? new Completions(client) : new Responses(client)
      const chunks = await collect(
        adapter.chatStream({
          logger,
          model,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      )
      expect(
        chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)?.metadata,
      ).toMatchObject({
        tanstack: {
          source: { provider: 'openai', api: `openai-${api}`, model },
        },
      })
    },
  )

  it.each(['other-provider', 'openai'])(
    'keeps Responses item and call identity separate for %s',
    async (provider) => {
      const mock = sdk([responseCompleted], true)
      await collect(
        new Responses(mock.client).chatStream({
          logger,
          model,
          messages: [
            {
              role: 'assistant',
              content: null,
              metadata: {
                tanstack: {
                  source: {
                    provider,
                    api: 'openai-responses',
                    model: 'other-model',
                  },
                },
              },
              toolCalls: [
                {
                  id: 'call/bad',
                  type: 'function',
                  function: { name: 'inspect', arguments: '{}' },
                  metadata: { itemId: 'fc/item', namespace: 'tools' },
                },
              ],
            },
            { role: 'tool', toolCallId: 'call/bad', content: 'ok' },
          ],
        }),
      )
      const body = mock.bodies[0]
      expect(body).toMatchObject({
        input: [
          {
            type: 'function_call',
            call_id: 'call_bad',
            id:
              provider === 'openai'
                ? 'fc_item'
                : expect.stringMatching(/^fc_[a-z0-9]+$/),
          },
          { type: 'function_call_output', call_id: 'call_bad', output: 'ok' },
        ],
      })
    },
  )

  it.each(['completions', 'responses'] as const)(
    'allocates unique truncated foreign call IDs for %s',
    async (api) => {
      const mock = sdk(
        api === 'completions' ? [completed] : [responseCompleted],
        api === 'responses',
      )
      const ids = [`${'x'.repeat(80)}a`, `${'x'.repeat(80)}b`]
      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: null,
          metadata: {
            tanstack: {
              source: {
                provider: 'openai',
                api: api === 'responses' ? 'openai-responses' : 'other',
                model: 'other',
              },
            },
          },
          toolCalls: ids.map((id) => ({
            id,
            type: 'function',
            function: { name: 'inspect', arguments: '{}' },
            ...(api === 'responses'
              ? { metadata: { itemId: `fc_${'i'.repeat(80)}${id.at(-1)}` } }
              : {}),
          })),
        },
        ...ids.map(
          (id): ModelMessage => ({
            role: 'tool',
            toolCallId: id,
            content: 'ok',
          }),
        ),
      ]
      const adapter =
        api === 'completions'
          ? new Completions(mock.client)
          : new Responses(mock.client)
      await collect(adapter.chatStream({ logger, model, messages }))
      const body = mock.bodies[0]
      if (typeof body !== 'object' || body === null)
        throw new Error('Missing request body')
      const list =
        'messages' in body
          ? body.messages
          : 'input' in body
            ? body.input
            : undefined
      if (!Array.isArray(list)) throw new Error('Missing request messages')
      const callIds: Array<string> = []
      const resultIds: Array<string> = []
      const itemIds: Array<string> = []
      for (const item of list) {
        if (Array.isArray(item.tool_calls))
          callIds.push(
            ...item.tool_calls.map((call: { id: string }) => call.id),
          )
        if (item.type === 'function_call') callIds.push(item.call_id)
        if (item.type === 'function_call' && typeof item.id === 'string')
          itemIds.push(item.id)
        if (item.role === 'tool') resultIds.push(item.tool_call_id)
        if (item.type === 'function_call_output') resultIds.push(item.call_id)
      }
      expect(new Set(callIds).size).toBe(2)
      expect(callIds).toEqual(resultIds)
      expect(
        callIds.every((id) => id.length <= (api === 'completions' ? 40 : 64)),
      ).toBe(true)
      if (api === 'responses') {
        expect(new Set(itemIds).size).toBe(2)
        expect(
          itemIds.every((id) => id.length <= 64 && id.startsWith('fc_')),
        ).toBe(true)
      }
    },
  )

  it('preserves foreign readable thinking before and after a tool call', async () => {
    const mock = sdk([responseCompleted], true)
    await collect(
      new Responses(mock.client).chatStream({
        logger,
        model,
        messages: [
          {
            role: 'assistant',
            content: '',
            thinking: [
              { content: 'before', signature: 'opaque' },
              { content: 'after', signature: 'opaque' },
            ],
            metadata: {
              tanstack: {
                source: { provider: 'other', api: 'other', model: 'other' },
              },
            },
            toolCalls: [
              {
                id: 'call',
                type: 'function',
                function: { name: 'inspect', arguments: '{}' },
              },
            ],
            blockOrder: [
              { type: 'thinking', index: 0 },
              { type: 'tool-call', id: 'call' },
              { type: 'thinking', index: 1 },
            ],
          },
          { role: 'tool', toolCallId: 'call', content: 'ok' },
        ],
      }),
    )
    expect(mock.bodies[0]).toMatchObject({
      input: [
        { type: 'message', role: 'assistant', content: 'before' },
        { type: 'function_call', call_id: 'call' },
        { type: 'message', role: 'assistant', content: 'after' },
        { type: 'function_call_output', call_id: 'call' },
      ],
    })
    expect(JSON.stringify(mock.bodies[0])).not.toContain('opaque')
  })
  it.each([
    undefined,
    { provider: 'openai', api: 'openai-completions', model },
  ])(
    'keeps the full ordinary Completions request with source %j',
    async (source) => {
      const mock = sdk([completed])
      const adapter = new Completions(mock.client)
      const controller = new AbortController()
      await collect(
        adapter.chatStream({
          logger,
          model,
          systemPrompts: ['System'],
          messages: [
            { role: 'user', content: 'Hello' },
            {
              role: 'assistant',
              content: [{ type: 'text', content: 'Prior' }],
              ...(source ? { metadata: { tanstack: { source } } } : {}),
            },
            { role: 'user', content: [{ type: 'text', content: 'Next' }] },
          ],
          modelOptions: {
            temperature: 0.2,
            top_p: 0.7,
            max_completion_tokens: 100,
            prompt_cache_key: 'explicit-cache',
            tools: [
              {
                type: 'function',
                function: { name: 'raw', parameters: { type: 'object' } },
              },
            ],
          },
          promptCache: { key: 'ignored-base-cache', retention: 'short' },
          request: {
            headers: { 'x-request': 'value' },
            signal: controller.signal,
          },
        }),
      )
      expect(mock.bodies).toEqual([
        {
          temperature: 0.2,
          top_p: 0.7,
          max_completion_tokens: 100,
          prompt_cache_key: 'explicit-cache',
          tools: [
            {
              type: 'function',
              function: { name: 'raw', parameters: { type: 'object' } },
            },
          ],
          model,
          messages: [
            { role: 'system', content: 'System' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Prior' },
            { role: 'user', content: 'Next' },
          ],
          stream: true,
          stream_options: { include_usage: true },
        },
      ])
      expect(new Headers(mock.requests[0]?.headers).get('x-request')).toBe(
        'value',
      )
      expect(mock.completionsCreate.mock.calls[0]?.[1]).toEqual({
        headers: { 'x-request': 'value' },
        signal: controller.signal,
      })
      expect(controller.signal.aborted).toBe(false)
    },
  )

  it.each([undefined, { provider: 'openai', api: 'openai-responses', model }])(
    'keeps the full ordinary Responses request with source %j',
    async (source) => {
      const mock = sdk([responseCompleted], true)
      await collect(
        new Responses(mock.client).chatStream({
          logger,
          model,
          systemPrompts: ['System'],
          metadata: { app: 'value' },
          messages: [
            { role: 'user', content: 'Hello' },
            {
              role: 'assistant',
              content: [{ type: 'text', content: 'Prior' }],
              ...(source ? { metadata: { tanstack: { source } } } : {}),
            },
          ],
          modelOptions: {
            temperature: 0.2,
            top_p: 0.7,
            max_output_tokens: 100,
            prompt_cache_key: 'explicit-cache',
            tools: [
              { type: 'function', name: 'raw', parameters: { type: 'object' } },
            ],
          },
          promptCache: { key: 'ignored-base-cache', retention: 'short' },
        }),
      )
      expect(mock.bodies).toEqual([
        {
          temperature: 0.2,
          top_p: 0.7,
          max_output_tokens: 100,
          prompt_cache_key: 'explicit-cache',
          tools: [
            { type: 'function', name: 'raw', parameters: { type: 'object' } },
          ],
          model,
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
      expect(mock.responsesCreate.mock.calls[0]?.[1]).toEqual({})
    },
  )

  it('normalizes foreign composite IDs and pairs Completions results', async () => {
    const mock = sdk([completed])
    const messages: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: null,
        metadata: {
          tanstack: {
            source: { provider: 'foreign', api: 'responses', model: 'other' },
          },
        },
        toolCalls: [
          {
            id: 'call|fc/item',
            type: 'function',
            function: { name: 'inspect', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call|fc/item', content: 'ok' },
    ]
    await collect(
      new Completions(mock.client).chatStream({ logger, model, messages }),
    )
    expect(mock.bodies[0]).toMatchObject({
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_fc_item' }],
        },
        { role: 'tool', tool_call_id: 'call_fc_item', content: 'ok' },
      ],
    })
    expect(messages[0]?.toolCalls?.[0]?.id).toBe('call|fc/item')
  })

  it.each(['completions', 'responses'] as const)(
    'keeps genuine response identity from %s',
    async (api) => {
      const mock = sdk(
        api === 'completions' ? [completed] : [responseCompleted],
        api === 'responses',
      )
      const adapter =
        api === 'completions'
          ? new Completions(mock.client)
          : new Responses(mock.client)
      const chunks = await collect(
        adapter.chatStream({
          logger,
          model,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      )
      expect(
        chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED),
      ).toMatchObject({ responseId: 'response-1', model: 'resolved-model' })
    },
  )
})
