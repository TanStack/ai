import { describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { chat, EventType } from '@tanstack/ai'
import type {
  AdapterYieldChunk,
  ChatMiddleware,
  ModelMessage,
} from '@tanstack/ai'
import {
  resolveDebugOption,
  hashToolCallId,
} from '@tanstack/ai/adapter-internals'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'

describe('JSON keys at the SDK boundary', () => {
  it('preserves own SDK parameters and removes only synthesized argument nulls', async () => {
    const raw =
      '{"type":"object","properties":{"__proto__":{"type":"string"},"constructor":{"type":["string","null"]}},"required":[]}'
    const inputSchema = JSON.parse(raw)
    const mock = sdk([
      {
        id: 'response-1',
        model,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call',
                  type: 'function',
                  function: {
                    name: 'inspect',
                    arguments: '{"__proto__":null,"constructor":null}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
    ])
    const chunks = await collect(
      new Completions(mock.client).chatStream({
        logger,
        model,
        messages: [{ role: 'user', content: 'Go' }],
        tools: [{ name: 'inspect', description: 'Inspect', inputSchema }],
      }),
    )
    const request = JSON.parse(JSON.stringify(mock.bodies[0]))
    const properties = request.tools[0].function.parameters.properties
    expect(Object.hasOwn(properties, '__proto__')).toBe(true)
    expect(properties['__proto__'].type).toEqual(['string', 'null'])
    expect(Object.getPrototypeOf(properties)).toBe(Object.prototype)
    const end = chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_END)
    expect(end).toMatchObject({
      args: '{"__proto__":null,"constructor":null}',
      input: { constructor: null },
    })
    if (end?.type !== EventType.TOOL_CALL_END)
      throw new Error('Expected a tool end')
    expect(Object.hasOwn(end.input ?? {}, '__proto__')).toBe(false)
    expect(Object.getPrototypeOf(end.input)).toBe(Object.prototype)
    expect(JSON.stringify(inputSchema)).toBe(raw)
  })
})

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
  it.each([false, true])(
    'keeps authoritative raw terminal snapshots for Responses=%s',
    async (responses) => {
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
        const cases: Array<Array<unknown>> = responses
          ? [
              [
                {
                  type: 'response.output_item.added',
                  output_index: 0,
                  item: { ...item, arguments: '' },
                },
                {
                  type: 'response.function_call_arguments.done',
                  item_id: 'item',
                  arguments: raw,
                },
              ],
              [{ type: 'response.output_item.done', output_index: 0, item }],
              [
                {
                  ...responseCompleted,
                  response: { ...responseCompleted.response, output: [item] },
                },
              ],
            ]
          : [
              [
                {
                  ...completed,
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: 'call',
                            type: 'function',
                            function: { name: 'inspect', arguments: raw },
                          },
                        ],
                      },
                      finish_reason: 'tool_calls',
                    },
                  ],
                },
              ],
              [
                {
                  ...completed,
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: 'call',
                            type: 'function',
                            function: { name: 'inspect', arguments: raw },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                },
              ],
            ]
        cases.push(
          responses
            ? [
                {
                  type: 'response.output_item.added',
                  output_index: 0,
                  item: { ...item, name: '', arguments: '' },
                },
                {
                  type: 'response.function_call_arguments.done',
                  item_id: 'item',
                  arguments: raw,
                },
                { type: 'response.output_item.done', output_index: 0, item },
              ]
            : [
                {
                  ...completed,
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          { index: 0, function: { arguments: raw } },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                },
                {
                  ...completed,
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: 'call',
                            type: 'function',
                            function: { name: 'inspect' },
                          },
                        ],
                      },
                      finish_reason: 'tool_calls',
                    },
                  ],
                },
              ],
        )
        if (responses)
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
        for (const events of cases) {
          const mock = sdk(events, responses)
          const adapter = responses
            ? new Responses(mock.client)
            : new Completions(mock.client)
          const chunks = await collect(
            adapter.chatStream({
              logger,
              model,
              messages: [{ role: 'user', content: 'Go' }],
            }),
          )
          const end = chunks.find(
            (chunk) => chunk.type === EventType.TOOL_CALL_END,
          )
          expect(end).toMatchObject({ args: raw })
          if (raw.trim() === '' || raw === '{\"n\":')
            expect(end).not.toHaveProperty('input')
          else expect(end).toMatchObject({ input: JSON.parse(raw) })
        }
      }
    },
  )

  it.each([false, true])(
    'rejects raw wrong-type and malformed inputs before dispatch for Responses=%s',
    async (responses) => {
      // A literal null runs as {} (issue #265), so it is not in this list.
      for (const raw of ['7', 'false', '\"text\"', '[1]', '{\"n\":']) {
        for (const client of [false, true]) {
          const item = {
            type: 'function_call',
            id: 'item',
            call_id: 'call',
            name: 'inspect',
            arguments: raw,
            status: 'completed',
          }
          const events = responses
            ? [
                {
                  ...responseCompleted,
                  response: { ...responseCompleted.response, output: [item] },
                },
              ]
            : [
                {
                  ...completed,
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: 'call',
                            type: 'function',
                            function: { name: 'inspect', arguments: raw },
                          },
                        ],
                      },
                      finish_reason: 'tool_calls',
                    },
                  ],
                },
              ]
          const mock = sdk(events, responses, true)
          const adapter = responses
            ? new Responses(mock.client)
            : new Completions(mock.client)
          const execute = vi.fn(async () => 'never')
          const chunks = await collect(
            chat({
              adapter,
              messages: [{ role: 'user', content: 'Go' }],
              tools: [
                {
                  name: 'inspect',
                  description: 'Inspect input',
                  inputSchema: {
                    type: 'object',
                    properties: { optional: { type: 'string' } },
                  },
                  ...(client ? {} : { execute }),
                },
              ],
            }),
          )
          expect(execute).not.toHaveBeenCalled()
          expect(JSON.stringify(chunks)).not.toContain('client_tool_call')
        }
      }
    },
  )

  it.each([false, true])(
    'executes accepted authored scalar inputs once for Responses=%s',
    async (responses) => {
      for (const value of [7, false, null, 'text', [1]]) {
        const raw = JSON.stringify(value)
        const item = {
          type: 'function_call',
          id: 'item',
          call_id: 'call',
          name: 'inspect',
          arguments: raw,
          status: 'completed',
        }
        const events = responses
          ? [
              {
                ...responseCompleted,
                response: { ...responseCompleted.response, output: [item] },
              },
            ]
          : [
              {
                ...completed,
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call',
                          type: 'function',
                          function: { name: 'inspect', arguments: raw },
                        },
                      ],
                    },
                    finish_reason: 'tool_calls',
                  },
                ],
              },
            ]
        const mock = sdk(events, responses, true)
        const adapter = responses
          ? new Responses(mock.client)
          : new Completions(mock.client)
        const validate = vi.fn((input: unknown) => ({ value: input }))
        const execute = vi.fn(async (_input: unknown) => 'done')
        await collect(
          chat({
            adapter,
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
        expect(execute.mock.calls[0]?.[0]).toEqual(value)
        expect(validate).toHaveBeenCalledTimes(1)
      }
    },
  )

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
        { model, input: [call, output], stream: true, tools: [] },
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
          { type: 'function_call', call_id: 'ordinary', namespace: 'tools' },
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

  it.each(['local_shell', 'apply_patch'] as const)(
    'sanitizes decoded %s output text',
    async (name) => {
      const mock = sdk([responseCompleted], true)
      await collect(
        new Responses(mock.client).chatStream({
          logger,
          model,
          messages: [
            {
              role: 'assistant',
              content: null,
              toolCalls: [
                {
                  id: 'call-native',
                  type: 'function',
                  function: {
                    name,
                    arguments: JSON.stringify(
                      name === 'local_shell'
                        ? { command: ['echo', 'hello'] }
                        : {
                            operation: {
                              type: 'delete_file',
                              path: 'file.txt',
                            },
                          },
                    ),
                  },
                  metadata: { openaiUserTool: name },
                },
              ],
            },
            {
              role: 'tool',
              toolCallId: 'call-native',
              content: JSON.stringify({ output: 'hello\ud800\ud83d\ude00' }),
            },
          ],
        }),
      )
      expect(mock.bodies[0]).toMatchObject({
        input: [
          { type: `${name}_call` },
          { type: `${name}_call_output`, output: 'hello\ud83d\ude00' },
        ],
      })
    },
  )
  it('sanitizes decoded native shell output text', async () => {
    const mock = sdk([responseCompleted], true)
    await collect(
      new Responses(mock.client).chatStream({
        logger,
        model,
        messages: [
          {
            role: 'assistant',
            content: null,
            toolCalls: [
              {
                id: 'call-shell',
                type: 'function',
                function: {
                  name: 'shell',
                  arguments: '{"commands":["echo hello"]}',
                },
                metadata: { openaiUserTool: 'shell', itemId: 'shell-item' },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call-shell',
            content: JSON.stringify({
              output: [
                {
                  stdout: 'hello\ud800😀',
                  stderr: 'err\ud800😀',
                  outcome: { type: 'exit', exit_code: 0 },
                },
              ],
            }),
          },
        ],
      }),
    )
    expect(mock.bodies[0]).toMatchObject({
      input: [
        { type: 'shell_call' },
        {
          type: 'shell_call_output',
          output: [
            {
              stdout: 'hello😀',
              stderr: 'err😀',
              outcome: { type: 'exit', exit_code: 0 },
            },
          ],
        },
      ],
    })
  })
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

  it('sanitizes request text and decoded argument strings without changing image URLs', async () => {
    const mock = sdk([completed])
    const args = ' { "text": "a\\ud800b", "number": 1e2 } '
    await collect(
      new Completions(mock.client).chatStream({
        logger,
        model,
        systemPrompts: ['S\ud800😀'],
        messages: [
          {
            role: 'assistant',
            content: 'A\ud800😀',
            toolCalls: [
              {
                id: 'call',
                type: 'function',
                function: { name: 'inspect\ud800', arguments: args },
              },
            ],
          },
          { role: 'tool', toolCallId: 'call', content: 'T\ud800😀' },
          {
            role: 'user',
            content: [
              { type: 'text', content: 'U\ud800😀' },
              {
                type: 'image',
                source: { type: 'url', value: 'https://example.com/\ud800' },
              },
            ],
          },
        ],
      }),
    )
    expect(mock.bodies[0]).toMatchObject({
      messages: [
        { role: 'system', content: 'S😀' },
        {
          role: 'assistant',
          content: 'A😀',
          tool_calls: [
            {
              function: {
                name: 'inspect',
                arguments: ' { "text": "ab", "number": 1e2 } ',
              },
            },
          ],
        },
        { role: 'tool', content: 'T😀' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'U😀' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/\ud800' },
            },
          ],
        },
      ],
    })
  })

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
        tools: [],
        input: [
          {
            type: 'function_call',
            call_id: 'call_bad',
            id:
              provider === 'openai'
                ? 'fc_item'
                : expect.stringMatching(/^fc_[a-z0-9]+$/),
            namespace: 'tools',
          },
          { type: 'function_call_output', call_id: 'call_bad', output: 'ok' },
        ],
      })
    },
  )

  it.each([{}, []])(
    'rejects malformed structured deltas %j',
    async (content) => {
      const mock = sdk([
        {
          id: 'response-1',
          model,
          choices: [{ delta: { content }, finish_reason: 'stop' }],
        },
      ])
      const chunks = await collect(
        new Completions(mock.client).structuredOutputStream({
          chatOptions: {
            logger,
            model,
            messages: [{ role: 'user', content: 'JSON' }],
          },
          outputSchema: { type: 'object', properties: {} },
        }),
      )
      expect(
        chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)?.message,
      ).toBe(
        `invalid choices[0].delta.content: expected a string, null, or an omitted field; received ${Array.isArray(content) ? 'an array' : 'an object'}`,
      )
      expect(
        chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED),
      ).toBe(false)
    },
  )

  it('rejects an unknown structured finish before producing a complete object', async () => {
    const mock = sdk([
      {
        id: 'response-1',
        model,
        choices: [{ delta: { content: '{}' }, finish_reason: 'unknown' }],
      },
    ])
    const chunks = await collect(
      new Completions(mock.client).structuredOutputStream({
        chatOptions: {
          logger,
          model,
          messages: [{ role: 'user', content: 'JSON' }],
        },
        outputSchema: { type: 'object', properties: {} },
      }),
    )
    expect(
      chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)?.message,
    ).toBe('Provider finish_reason: unknown')
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === 'CUSTOM' &&
          chunk.name === 'structured-output.complete',
      ),
    ).toBe(false)
  })

  it.each(['stop', 'length', 'content_filter', 'tool_calls', 'function_call'])(
    'accepts known finish %s with null and missing content',
    async (finish_reason) => {
      const mock = sdk([
        {
          id: 'response-1',
          model,
          choices: [{ delta: { content: null }, finish_reason: null }],
        },
        { id: 'response-1', model, choices: [{ delta: {}, finish_reason }] },
      ])
      const chunks = await collect(
        new Completions(mock.client).chatStream({
          logger,
          model,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      )
      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        false,
      )
      const finish = chunks.find(
        (chunk) => chunk.type === EventType.RUN_FINISHED,
      )
      expect(finish?.finishReason).toBe(
        finish_reason === 'function_call'
          ? 'tool_calls'
          : finish_reason === 'tool_calls'
            ? 'stop'
            : finish_reason,
      )
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
      tools: [],
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

  it.each([true, false])(
    'batches tool-result images with runtime image capability %s',
    async (images) => {
      const mock = sdk([completed])
      await collect(
        new Completions(mock.client, images).chatStream({
          logger,
          model,
          messages: [
            {
              role: 'assistant',
              content: null,
              toolCalls: ['a', 'b'].map((id) => ({
                id,
                type: 'function',
                function: { name: 'inspect', arguments: '{}' },
              })),
            },
            {
              role: 'tool',
              toolCallId: 'a',
              content: [
                {
                  type: 'image',
                  source: { type: 'data', value: 'AAA', mimeType: 'image/png' },
                },
              ],
            },
            {
              role: 'tool',
              toolCallId: 'b',
              content: [
                { type: 'text', content: 'text' },
                {
                  type: 'image',
                  source: { type: 'data', value: 'BBB', mimeType: 'image/png' },
                },
              ],
            },
          ],
        }),
      )
      expect(mock.bodies[0]).toMatchObject({
        messages: [
          { role: 'assistant', content: null },
          { role: 'tool', tool_call_id: 'a', content: '(see attached image)' },
          { role: 'tool', tool_call_id: 'b', content: 'text' },
          ...(images
            ? [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: { url: 'data:image/png;base64,AAA' },
                    },
                    {
                      type: 'image_url',
                      image_url: { url: 'data:image/png;base64,BBB' },
                    },
                  ],
                },
              ]
            : []),
        ],
      })
      if (!images) expect(JSON.stringify(mock.bodies)).not.toContain('AAA')
    },
  )

  it.each([
    { invalid: 'unknown', server: true },
    { invalid: { bad: true }, server: true },
    { invalid: ['bad'], server: true },
    { invalid: 'unknown', server: false },
    { invalid: { bad: true }, server: false },
    { invalid: ['bad'], server: false },
  ])(
    'fails before executing or exposing a partial tool for invalid provider data $invalid / $server',
    async ({ invalid, server }) => {
      const execute = vi.fn(() => 'executed')
      const mock = sdk([
        {
          id: 'response-1',
          model,
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'inspect', arguments: '{}' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'response-1',
          model,
          choices: [
            {
              delta: { content: typeof invalid === 'string' ? null : invalid },
              finish_reason:
                typeof invalid === 'string' ? invalid : 'tool_calls',
            },
          ],
        },
      ])
      const chunks = await collect(
        chat({
          adapter: new Completions(mock.client),
          messages: [{ role: 'user', content: 'Inspect' }],
          tools: [
            {
              name: 'inspect',
              description: 'Inspect',
              ...(server ? { execute } : {}),
            },
          ],
        }),
      )
      expect(execute).not.toHaveBeenCalled()
      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        true,
      )
      expect(
        chunks.some(
          (chunk) =>
            chunk.type === EventType.RUN_FINISHED &&
            chunk.outcome?.type === 'interrupt',
        ),
      ).toBe(false)
      expect(
        chunks.some((chunk) => chunk.type === EventType.TOOL_CALL_END),
      ).toBe(false)
    },
  )

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

describe('Responses answer items on replay', () => {
  /** Turn 1 with one answer item. Returns the saved transcript. */
  async function firstTurn() {
    const answer = {
      type: 'message',
      id: 'msg_answer',
      role: 'assistant',
      status: 'completed',
      phase: 'final_answer',
      content: [{ type: 'output_text', text: 'Hi there', annotations: [] }],
    }
    const mock = sdk(
      [
        {
          ...responseCompleted,
          response: { ...responseCompleted.response, output: [answer] },
        },
      ],
      true,
    )
    let saved: Array<ModelMessage> = []
    const keep: ChatMiddleware = {
      name: 'keep-transcript',
      onFinish(ctx) {
        saved = [...ctx.messages]
      },
    }
    await collect(
      chat({
        adapter: new Responses(mock.client),
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [keep],
      }),
    )
    return saved
  }

  /** Turn 2 on `messages`. Returns the assistant items of its request input. */
  async function secondTurnInput(messages: Array<ModelMessage>) {
    const mock = sdk([responseCompleted], true)
    await collect(
      chat({
        adapter: new Responses(mock.client),
        messages: [...messages, { role: 'user', content: 'Again' }],
      }),
    )
    const body = mock.bodies[0] as { input: Array<Record<string, unknown>> }
    return body.input.filter((item) => item.role === 'assistant')
  }

  it('sends the id and phase of the first answer on a same-model request', async () => {
    const saved = await firstTurn()
    expect(saved.at(-1)?.metadata?.tanstack?.responseItems).toEqual([
      { id: 'msg_answer', phase: 'final_answer' },
    ])
    expect(await secondTurnInput(saved)).toEqual([
      {
        type: 'message',
        role: 'assistant',
        id: 'msg_answer',
        status: 'completed',
        phase: 'final_answer',
        content: [{ type: 'output_text', text: 'Hi there', annotations: [] }],
      },
    ])
  })

  it('leaves them out for another model', async () => {
    const saved = (await firstTurn()).map((message) =>
      message.role === 'assistant'
        ? {
            ...message,
            metadata: {
              tanstack: {
                ...message.metadata?.tanstack,
                source: {
                  provider: 'openai',
                  api: 'openai-responses',
                  model: 'gpt-4.1',
                },
              },
            },
          }
        : message,
    )
    expect(await secondTurnInput(saved)).toEqual([
      { type: 'message', role: 'assistant', content: 'Hi there' },
    ])
  })
})
