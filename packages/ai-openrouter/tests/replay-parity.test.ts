import { describe, expect, it, vi } from 'vitest'
import { HTTPClient } from '@openrouter/sdk'
import { chat, EventType } from '@tanstack/ai'
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
  it('ignores inherited JSON keys when comparing injected SDK schemas', async () => {
    const properties = JSON.parse('{"owned":{"type":"string"}}')
    Object.setPrototypeOf(properties, {
      ghost: { type: 'string' },
      toString: { type: 'string' },
    })
    const inputSchema = { type: 'object', properties, required: [] }
    const wireRaw =
      '{"type":"object","properties":{"ghost":{"type":["string","null"]},"toString":{"type":["string","null"]},"owned":{"type":["string","null"]}},"required":["ghost","toString","owned"]}'
    const wireSchema = JSON.parse(wireRaw)
    const raw = '{"ghost":null,"toString":null,"owned":null}'
    const item = {
      type: 'function_call',
      id: 'item',
      call_id: 'call',
      name: 'inspect',
      arguments: raw,
      status: 'completed',
    }
    const mock = sdk('responses', [
      {
        type: 'response.completed',
        sequence_number: 1,
        response: { ...response(), output: [item] },
      },
    ])
    class InjectedResponses extends OpenRouterResponsesTextAdapter<
      typeof model
    > {
      protected override makeStructuredOutputCompatible() {
        return wireSchema
      }
    }
    const adapter = new InjectedResponses(mock.config, model)
    const chunks = await collect(
      adapter.chatStream({
        logger,
        model,
        messages: [{ role: 'user', content: 'Go' }],
        tools: [{ name: 'inspect', description: 'Inspect', inputSchema }],
      }),
    )
    const end = chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_END)
    expect(end).toMatchObject({
      args: raw,
      input: { ghost: null, toString: null },
    })
    if (end?.type !== EventType.TOOL_CALL_END)
      throw new Error('Expected normalized input')
    expect(Object.getPrototypeOf(end.input)).toBe(Object.prototype)
    const request = JSON.parse(JSON.stringify(mock.bodies[0]))
    expect(request.tools[0].parameters.properties).toEqual(
      wireSchema.properties,
    )
    expect(JSON.stringify(wireSchema)).toBe(wireRaw)
    expect(JSON.stringify(inputSchema.properties)).toBe(
      '{"owned":{"type":"string"}}',
    )
    expect(Object.hasOwn(inputSchema.properties, 'ghost')).toBe(false)
    expect(Object.hasOwn(inputSchema.properties, 'toString')).toBe(false)
  })

  it.each(
    (
      ['arguments.done', 'output_item.done', 'response.completed'] as const
    ).flatMap((terminal) =>
      [false, true].map((required) => ({ terminal, required })),
    ),
  )(
    'normalizes own JSON keys at $terminal with required $required without losing raw arguments',
    async ({ terminal, required }) => {
      const schemaRaw = required
        ? '{"type":"object","properties":{"__proto__":{"type":"object","properties":{"constructor":{"type":"string"},"optional":{"type":"string"}},"required":["constructor"]},"nullable":{"type":["string","null"]}},"required":["__proto__","nullable"]}'
        : '{"type":"object","properties":{"__proto__":{"type":"string"},"nullable":{"type":["string","null"]}},"required":["nullable"]}'
      const inputSchema = JSON.parse(schemaRaw)
      const raw = required
        ? '{"__proto__":{"constructor":"kept","optional":null},"nullable":null}'
        : '{"__proto__":null,"nullable":null}'
      const item = {
        type: 'function_call',
        id: 'item',
        call_id: 'call',
        name: 'inspect',
        arguments: raw,
        status: 'completed',
      }
      const events =
        terminal === 'arguments.done'
          ? [
              {
                type: 'response.output_item.added',
                sequence_number: 1,
                output_index: 0,
                item: { ...item, arguments: '' },
              },
              {
                type: 'response.function_call_arguments.done',
                sequence_number: 2,
                output_index: 0,
                item_id: 'item',
                arguments: raw,
              },
            ]
          : terminal === 'output_item.done'
            ? [
                {
                  type: 'response.output_item.done',
                  sequence_number: 1,
                  output_index: 0,
                  item,
                },
              ]
            : [
                {
                  type: 'response.completed',
                  sequence_number: 1,
                  response: { ...response(), output: [item] },
                },
              ]
      const mock = sdk('responses', events)
      const chunks = await collect(
        mock.adapter.chatStream({
          logger,
          model,
          messages: [{ role: 'user', content: 'Go' }],
          tools: [{ name: 'inspect', description: 'Inspect', inputSchema }],
        }),
      )
      const end = chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_END)
      expect(end).toMatchObject({
        args: raw,
        input: required
          ? JSON.parse('{"__proto__":{"constructor":"kept"},"nullable":null}')
          : { nullable: null },
      })
      if (
        end?.type !== EventType.TOOL_CALL_END ||
        !end.input ||
        typeof end.input !== 'object'
      )
        throw new Error('Expected normalized object input')
      expect(JSON.stringify(end.input)).toBe(
        required
          ? '{"__proto__":{"constructor":"kept"},"nullable":null}'
          : '{"nullable":null}',
      )
      expect(Object.hasOwn(end.input, '__proto__')).toBe(required)
      expect(Object.getPrototypeOf(end.input)).toBe(Object.prototype)
      if (required)
        expect(
          Object.getOwnPropertyDescriptor(end.input, '__proto__')?.enumerable,
        ).toBe(true)
      const request = JSON.parse(JSON.stringify(mock.bodies[0]))
      const properties = request.tools[0].parameters.properties
      expect(Object.hasOwn(properties, '__proto__')).toBe(true)
      expect(Object.getPrototypeOf(properties)).toBe(Object.prototype)
      expect(JSON.stringify(inputSchema)).toBe(schemaRaw)
    },
  )
  it.each(['chat', 'responses'] as const)(
    'publishes authoritative %s terminal arguments without repairing malformed JSON',
    async (api) => {
      for (const raw of [
        '',
        '  ',
        '7',
        'null',
        'false',
        '\"text\"',
        '[1]',
        '{\"n\":1e999}',
        '{\"n\":',
      ]) {
        const item = {
          type: 'function_call',
          id: 'item',
          call_id: 'call',
          name: 'inspect',
          arguments: raw,
          status: 'completed',
        }
        const cases: Array<Array<unknown>> =
          api === 'chat'
            ? [
                [
                  chatChunk(
                    {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call',
                          type: 'function',
                          function: { name: 'inspect', arguments: raw },
                        },
                      ],
                    },
                    'tool_calls',
                  ),
                ],
                [
                  chatChunk(
                    {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call',
                          type: 'function',
                          function: { name: 'inspect', arguments: raw },
                        },
                      ],
                    },
                    '',
                  ),
                ],
              ]
            : [
                [
                  {
                    type: 'response.output_item.added',
                    sequence_number: 1,
                    output_index: 0,
                    item: { ...item, arguments: '' },
                  },
                  {
                    type: 'response.function_call_arguments.done',
                    sequence_number: 2,
                    output_index: 0,
                    item_id: 'item',
                    arguments: raw,
                  },
                ],
                [
                  {
                    type: 'response.output_item.done',
                    sequence_number: 1,
                    output_index: 0,
                    item,
                  },
                ],
                [
                  {
                    type: 'response.completed',
                    sequence_number: 1,
                    response: { ...response(), output: [item] },
                  },
                ],
              ]
        if (api === 'responses')
          cases.push([
            {
              type: 'response.output_item.added',
              sequence_number: 1,
              output_index: 0,
              item: { ...item, name: '', arguments: '' },
            },
            {
              type: 'response.function_call_arguments.delta',
              sequence_number: 2,
              item_id: 'item',
              delta: raw.slice(0, Math.floor(raw.length / 2)),
            },
            {
              type: 'response.function_call_arguments.delta',
              sequence_number: 3,
              item_id: 'item',
              delta: raw.slice(Math.floor(raw.length / 2)),
            },
            {
              type: 'response.output_item.done',
              sequence_number: 4,
              output_index: 0,
              item: { ...item, arguments: undefined },
            },
          ])
        if (api === 'responses')
          cases.push([
            {
              type: 'response.function_call_arguments.delta',
              sequence_number: 1,
              output_index: 0,
              item_id: 'item',
              delta: raw,
            },
            {
              type: 'response.completed',
              sequence_number: 2,
              response: {
                ...response(),
                output: [{ ...item, arguments: undefined }],
              },
            },
          ])
        if (api === 'chat')
          cases.push([
            chatChunk(
              { tool_calls: [{ index: 0, function: { arguments: raw } }] },
              '',
            ),
            chatChunk(
              {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call',
                    type: 'function',
                    function: { name: 'inspect' },
                  },
                ],
              },
              'tool_calls',
            ),
          ])
        for (const events of cases) {
          const mock = sdk(api, events)
          const chunks = await collect(
            mock.adapter.chatStream({
              logger,
              model,
              messages: [{ role: 'user', content: 'Go' }],
            }),
          )
          const end = chunks.find(
            (chunk) => chunk.type === EventType.TOOL_CALL_END,
          )
          expect(end, JSON.stringify({ raw, events, chunks })).toMatchObject({
            args: raw,
          })
          if (raw.trim() === '' || raw === '{\"n\":')
            expect(end).not.toHaveProperty('input')
          else expect(end).toMatchObject({ input: JSON.parse(raw) })
        }
      }
    },
  )

  it('keeps absent arguments absent in nested SDK fallback items', async () => {
    const item = {
      type: 'function_call',
      id: 'item',
      call_id: 'call',
      name: 'inspect',
      status: 'completed',
    }
    const mock = sdk('responses', [
      {
        type: 'response.completed',
        sequence_number: 1,
        response: { ...response(), output: [item] },
      },
    ])
    const chunks = await collect(
      mock.adapter.chatStream({
        logger,
        model,
        messages: [{ role: 'user', content: 'Go' }],
      }),
    )
    const end = chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_END)
    expect(end).toMatchObject({ toolCallId: 'call' })
    expect(end).not.toHaveProperty('args')
    expect(end).not.toHaveProperty('input')
  })

  it.each(['chat', 'responses'] as const)(
    'preserves raw %s scalar inputs for the final schema check',
    async (api) => {
      for (const value of [7, null, 'text']) {
        const args = JSON.stringify(value)
        const item = {
          type: 'function_call',
          id: 'item',
          call_id: 'call',
          name: 'inspect',
          arguments: args,
          status: 'completed',
        }
        const events =
          api === 'chat'
            ? [
                chatChunk(
                  {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call',
                        type: 'function',
                        function: { name: 'inspect', arguments: args },
                      },
                    ],
                  },
                  'tool_calls',
                ),
              ]
            : [
                {
                  type: 'response.completed',
                  sequence_number: 1,
                  response: { ...response(), output: [item] },
                },
              ]
        const mock = sdk(api, events)
        const execute = vi.fn(async () => 'never')
        const chunks = await collect(
          chat({
            adapter: mock.adapter,
            messages: [{ role: 'user', content: 'Go' }],
            tools: [
              {
                name: 'inspect',
                description: 'Inspect input',
                inputSchema: {
                  type: 'object',
                  properties: { optional: { type: 'string' } },
                },
                execute,
              },
            ],
          }),
        )
        expect(execute).not.toHaveBeenCalled()
        expect(
          chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_END),
        ).toMatchObject({ input: value })
        expect(JSON.stringify(chunks)).toContain('Received arguments')
        expect(JSON.stringify(mock.bodies)).toContain(
          args.replaceAll('"', '\\"'),
        )
      }
    },
  )

  it.each(['chat', 'responses'] as const)(
    'checks %s client inputs and preserves accepted primitive inputs',
    async (api) => {
      for (const value of [7, null, 'text']) {
        const args = JSON.stringify(value)
        const item = {
          type: 'function_call',
          id: 'item',
          call_id: 'call',
          name: 'inspect',
          arguments: args,
          status: 'completed',
        }
        const events =
          api === 'chat'
            ? [
                chatChunk(
                  {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call',
                        type: 'function',
                        function: { name: 'inspect', arguments: args },
                      },
                    ],
                  },
                  'tool_calls',
                ),
              ]
            : [
                {
                  type: 'response.completed',
                  sequence_number: 1,
                  response: { ...response(), output: [item] },
                },
              ]
        const client = sdk(api, events)
        const chunks = await collect(
          chat({
            adapter: client.adapter,
            messages: [{ role: 'user', content: 'Go' }],
            tools: [
              {
                name: 'inspect',
                description: 'Inspect input',
                inputSchema: {
                  type: 'object',
                  properties: { optional: { type: 'string' } },
                },
              },
            ],
          }),
        )
        expect(JSON.stringify(chunks)).not.toContain('client_tool_call')
        expect(JSON.stringify(chunks)).toContain('Received arguments')
        const accepted = sdk(api, events)
        const validate = vi.fn((input: unknown) => ({ value: input }))
        const execute = vi.fn(async (input: unknown) => input)
        await collect(
          chat({
            adapter: accepted.adapter,
            messages: [{ role: 'user', content: 'Go' }],
            tools: [
              {
                name: 'inspect',
                description: 'Inspect input',
                inputSchema: {
                  '~standard': {
                    version: 1,
                    vendor: 'test',
                    validate,
                    jsonSchema: { input: () => ({}), output: () => ({}) },
                  },
                },
                execute,
              },
            ],
          }),
        )
        expect(execute).toHaveBeenCalledTimes(1)
        expect(execute.mock.calls[0]?.[0]).toBe(value)
        expect(validate).toHaveBeenCalledTimes(1)
        const structured = sdk(api, events)
        const stream = await collect(
          structured.adapter.structuredOutputStream({
            chatOptions: {
              logger,
              model,
              messages: [{ role: 'user', content: 'Go' }],
            },
            outputSchema: { type: 'object' },
          }),
        )
        expect(
          stream.some((chunk) => chunk.type === EventType.TOOL_CALL_END),
        ).toBe(false)
      }
    },
  )

  it.each(['chat', 'responses'] as const)(
    'replays foreign ordered thinking, IDs and decoded Unicode through %s',
    async (api) => {
      const mock = sdk(api)
      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'middle\ud800',
          thinking: [
            { content: 'before\ud800', signature: 'signature-state' },
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
                arguments:
                  '{ "n":9007199254740993,"nested":{"s":"\\ud800ok"} }',
              },
              metadata: { itemId: 'stale-item', namespace: 'tools' },
            },
          ],
          blockOrder: [
            { type: 'thinking', index: 0 },
            { type: 'text', length: 7 },
            { type: 'tool-call', id: 'call/bad|item/bad' },
            { type: 'thinking', index: 1 },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call/bad|item/bad',
          content: '{"n":1e999,"s":"\\ud800ok"}',
        },
        {
          role: 'user',
          content: [
            { type: 'text', content: 'next\ud800😀' },
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
          systemPrompts: ['system\ud800'],
        }),
      )
      const expectedCall = api === 'chat' ? 'call_bad_item_bad' : 'call_bad'
      if (api === 'chat')
        expect(mock.bodies[0]).toMatchObject({
          tools: [],
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
          tools: [],
          instructions: 'system',
          input: [
            { type: 'message', role: 'assistant', content: 'beforemiddle' },
            {
              type: 'function_call',
              call_id: expectedCall,
              id: 'fc_' + hashToolCallId('item/bad'),
              namespace: 'tools',
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

  it.each(['error', 'unknown'])(
    'rejects native Chat finish %s before tool completion or execution',
    async (finish) => {
      const mock = sdk('chat', [
        chatChunk(
          {
            tool_calls: [
              {
                index: 0,
                id: 'call',
                type: 'function',
                function: { name: 'inspect', arguments: '{}' },
              },
            ],
          },
          finish,
        ),
      ])
      const execute = vi.fn(async () => 'never')
      const chunks = await collect(
        chat({
          adapter: mock.adapter,
          messages: [{ role: 'user', content: 'Go' }],
          tools: [{ name: 'inspect', description: 'Inspect input', execute }],
        }),
      )
      expect(
        chunks.find((chunk) => chunk.type === EventType.RUN_ERROR),
      ).toMatchObject({ message: 'Provider finish_reason: ' + finish })
      expect(
        chunks.some((chunk) => chunk.type === EventType.TOOL_CALL_END),
      ).toBe(false)
      expect(
        chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED),
      ).toBe(false)
      expect(execute).not.toHaveBeenCalled()
    },
  )

  it.each([{}, []])(
    'rejects malformed native Chat delta %j with the exact error',
    async (content) => {
      for (const structured of [false, true]) {
        const mock = sdk('chat', [
          chatChunk(
            {
              content,
              tool_calls: [
                {
                  index: 0,
                  id: 'call',
                  type: 'function',
                  function: { name: 'inspect', arguments: '{}' },
                },
              ],
            },
            'tool_calls',
          ),
        ])
        const args = {
          logger,
          model,
          messages: [{ role: 'user' as const, content: 'Go' }],
        }
        const chunks = await collect(
          structured
            ? mock.adapter.structuredOutputStream({
                chatOptions: args,
                outputSchema: { type: 'object' },
              })
            : mock.adapter.chatStream(args),
        )
        expect(
          chunks.find((chunk) => chunk.type === EventType.RUN_ERROR),
        ).toMatchObject({
          message:
            'invalid choices[0].delta.content: expected a string, null, or an omitted field; received ' +
            (Array.isArray(content) ? 'an array' : 'an object'),
        })
        expect(
          chunks.some((chunk) => chunk.type === EventType.TOOL_CALL_END),
        ).toBe(false)
        expect(
          chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED),
        ).toBe(false)
      }
    },
  )

  it.each([{}, []])(
    'rejects malformed delta %j before actual server or client dispatch',
    async (content) => {
      for (const client of [false, true]) {
        const mock = sdk('chat', [
          chatChunk(
            {
              content,
              tool_calls: [
                {
                  index: 0,
                  id: 'call',
                  type: 'function',
                  function: { name: 'inspect', arguments: '{}' },
                },
              ],
            },
            'tool_calls',
          ),
        ])
        const execute = vi.fn(async () => 'never')
        const chunks = await collect(
          chat({
            adapter: mock.adapter,
            messages: [{ role: 'user', content: 'Go' }],
            tools: [
              {
                name: 'inspect',
                description: 'Inspect input',
                ...(client ? {} : { execute }),
              },
            ],
          }),
        )
        expect(execute).not.toHaveBeenCalled()
        expect(JSON.stringify(chunks)).not.toContain('client_tool_call')
        expect(
          chunks.some((chunk) => chunk.type === EventType.TOOL_CALL_END),
        ).toBe(false)
        expect(
          chunks.find((chunk) => chunk.type === EventType.RUN_ERROR),
        ).toMatchObject({
          message:
            'invalid choices[0].delta.content: expected a string, null, or an omitted field; received ' +
            (Array.isArray(content) ? 'an array' : 'an object'),
        })
      }
    },
  )

  it('keeps unrelated SDK validation errors distinct from malformed content', async () => {
    const mock = sdk('chat', [chatChunk({ role: {}, content: 'text' })])
    const chunks = await collect(
      mock.adapter.chatStream({
        logger,
        model,
        messages: [{ role: 'user', content: 'Go' }],
      }),
    )
    const error = chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)
    expect(error).toBeDefined()
    expect(JSON.stringify(error)).not.toContain(
      'invalid choices[0].delta.content',
    )
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(
      false,
    )
  })

  it.each([null, undefined])(
    'accepts missing or null Chat delta content: %j',
    async (content) => {
      const mock = sdk('chat', [
        chatChunk(content === undefined ? {} : { content }),
      ])
      const chunks = await collect(
        mock.adapter.chatStream({
          logger,
          model,
          messages: [{ role: 'user', content: 'Go' }],
        }),
      )
      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        false,
      )
      expect(
        chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED),
      ).toBe(true)
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
