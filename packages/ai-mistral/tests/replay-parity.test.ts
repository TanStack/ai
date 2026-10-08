import { afterEach, describe, expect, it, vi } from 'vitest'
import { chat, EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { MistralTextAdapter } from '../src/adapters/text'
import { mistralVertexText } from '../src/vertex'
import type { AdapterYieldChunk, ModelMessage } from '@tanstack/ai'
import type { MistralTextAdapterModel } from '../src/model-meta'

function transport(events?: Array<unknown>) {
  const bodies: Array<unknown> = []
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const body: unknown = await request.json()
      bodies.push(body)
      if (
        body &&
        typeof body === 'object' &&
        'stream' in body &&
        body.stream === true
      ) {
        return new Response(
          events
            ? events
                .map((event) => 'data: ' + JSON.stringify(event) + '\n\n')
                .join('') + 'data: [DONE]\n\n'
            : 'data: {"id":"response_actual","model":"actual-model","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        )
      }
      return Response.json({
        id: 'response_actual',
        object: 'chat.completion',
        created: 0,
        model: 'actual-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{"answer":"ok"}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    },
  )
  return bodies
}

describe('JSON keys at the SDK boundary', () => {
  it('preserves own SDK parameters and removes only synthesized argument nulls', async () => {
    const raw =
      '{"type":"object","properties":{"__proto__":{"type":"string"},"constructor":{"type":["string","null"]}},"required":[]}'
    const inputSchema = JSON.parse(raw)
    const bodies = transport([
      {
        id: 'response_actual',
        model: 'mistral-small-latest',
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
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ])
    const adapter = new MistralTextAdapter(
      { apiKey: 'key' },
      'mistral-small-latest',
    )
    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of adapter.chatStream({
      ...options([{ role: 'user', content: 'Go' }]),
      tools: [{ name: 'inspect', description: 'Inspect', inputSchema }],
    }))
      chunks.push(chunk)
    const request = JSON.parse(JSON.stringify(bodies[0]))
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

function options(
  messages: Array<ModelMessage>,
  model = 'mistral-small-latest',
) {
  return {
    model,
    messages,
    logger: resolveDebugOption(false),
    systemPrompts: ['System'],
    modelOptions: {
      max_tokens: 128,
      temperature: 0.2,
      top_p: 0.8,
      random_seed: 7,
      stop: ['END'],
      safe_prompt: true,
    },
  }
}

async function run(
  path: string,
  messages: Array<ModelMessage>,
  model: MistralTextAdapterModel = 'mistral-small-latest',
) {
  const bodies = transport()
  const adapter = new MistralTextAdapter({ apiKey: 'key' }, model)
  const chunks: Array<AdapterYieldChunk> = []
  let result
  if (path === 'stream') {
    for await (const chunk of adapter.chatStream(options(messages, model)))
      chunks.push(chunk)
  } else
    result = await adapter.structuredOutput({
      chatOptions: options(messages, model),
      outputSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    })
  return { bodies, chunks, result }
}

const ordinary: Array<ModelMessage> = [
  { role: 'user', content: 'Hello' },
  {
    role: 'assistant',
    content: 'Hi',
    toolCalls: [
      {
        id: 'Abc123456',
        type: 'function',
        function: { name: 'lookup', arguments: '{"value":1}' },
      },
    ],
  },
  { role: 'tool', toolCallId: 'Abc123456', content: 'Result' },
]
const ordinaryMessages = [
  { role: 'system', content: 'System' },
  { role: 'user', content: 'Hello' },
  {
    role: 'assistant',
    content: 'Hi',
    tool_calls: [
      {
        id: 'Abc123456',
        type: 'function',
        function: { name: 'lookup', arguments: '{"value":1}' },
      },
    ],
  },
  { role: 'tool', tool_call_id: 'Abc123456', content: 'Result' },
]

describe('Mistral replay parity', () => {
  it.each(['stream', 'structured'])(
    'replays signed same-source thinking in %s without changing history',
    async (path) => {
      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'AB',
          thinking: [
            { content: 'First\ud800', signature: 'opaque-one' },
            { content: 'Second', signature: 'opaque-two' },
          ],
          blockOrder: [
            { type: 'thinking', index: 0 },
            { type: 'text', length: 1 },
            { type: 'thinking', index: 1 },
            { type: 'text', length: 1 },
          ],
          metadata: {
            tanstack: {
              source: {
                provider: 'mistral',
                api: 'mistral-conversations',
                model: 'mistral-small-latest',
              },
            },
          },
        },
      ]
      const saved = structuredClone(messages)
      const { bodies } = await run(path, messages)
      expect(bodies[0]).toMatchObject({
        messages: [
          { role: 'system', content: 'System' },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: [{ type: 'text', text: 'First' }] },
              { type: 'text', text: 'A' },
              {
                type: 'thinking',
                thinking: [{ type: 'text', text: 'Second' }],
              },
              { type: 'text', text: 'B' },
            ],
          },
        ],
      })
      expect(messages).toEqual(saved)
      const sourceFree = messages.map(
        ({ metadata: _metadata, ...message }) => message,
      )
      const sourceFreeSaved = structuredClone(sourceFree)
      expect((await run(path, sourceFree)).bodies[0]).toEqual(bodies[0])
      expect(sourceFree).toEqual(sourceFreeSaved)
    },
  )
  it('does not guess provider identity from a gateway URL', async () => {
    transport()
    const adapter = new MistralTextAdapter(
      { apiKey: 'key', baseURL: 'https://vertex-looking.example' },
      'mistral-small-latest',
    )
    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of adapter.chatStream(options([])))
      chunks.push(chunk)
    expect(chunks.find((chunk) => chunk.type === 'RUN_STARTED')).toMatchObject({
      metadata: {
        tanstack: {
          source: {
            provider: 'mistral',
            api: 'mistral-conversations',
            model: 'mistral-small-latest',
          },
        },
      },
    })
  })
  it('tags source on a failed first request and omits a missing generation ID', async () => {
    vi.stubGlobal('fetch', async () => new Response('fail', { status: 400 }))
    const adapter = new MistralTextAdapter(
      { apiKey: 'key' },
      'mistral-small-latest',
    )
    const chunks: Array<AdapterYieldChunk> = []
    await expect(async () => {
      for await (const chunk of adapter.chatStream(options([])))
        chunks.push(chunk)
    }).rejects.toThrow('Mistral API error 400')
    expect(chunks.find((chunk) => chunk.type === 'RUN_ERROR')).toMatchObject({
      metadata: {
        tanstack: {
          source: {
            provider: 'mistral',
            api: 'mistral-conversations',
            model: 'mistral-small-latest',
          },
        },
      },
    })
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        ),
    )
    const next = []
    for await (const chunk of adapter.chatStream(options([]))) next.push(chunk)
    expect(
      next.find((chunk) => chunk.type === 'RUN_FINISHED'),
    ).not.toHaveProperty('responseId')
  })

  afterEach(() => vi.unstubAllGlobals())
  it.each(['stream', 'structured'])(
    'keeps the complete ordinary %s request unchanged',
    async (path) => {
      const { bodies } = await run(path, ordinary)
      expect(bodies[0]).toEqual({
        model: 'mistral-small-latest',
        messages:
          path === 'stream'
            ? ordinaryMessages
            : [
                ordinaryMessages[0],
                ordinaryMessages[1],
                {
                  role: 'assistant',
                  content: 'Hi',
                  prefix: false,
                  tool_calls: [
                    {
                      id: 'Abc123456',
                      type: 'function',
                      index: 0,
                      function: { name: 'lookup', arguments: '{"value":1}' },
                    },
                  ],
                },
                ordinaryMessages[3],
              ],
        temperature: 0.2,
        max_tokens: 128,
        top_p: 0.8,
        random_seed: 7,
        stop: ['END'],
        safe_prompt: true,
        ...(path === 'stream'
          ? { stream: true, stream_options: { include_usage: true } }
          : {
              stream: false,
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: 'structured_output',
                  schema: {
                    type: 'object',
                    properties: { answer: { type: 'string' } },
                    required: ['answer'],
                    additionalProperties: false,
                  },
                  strict: true,
                },
              },
            }),
      })
      const sameSource = ordinary.map((message) =>
        message.role === 'assistant'
          ? {
              ...message,
              metadata: {
                tanstack: {
                  source: {
                    provider: 'mistral',
                    api: 'mistral-conversations',
                    model: 'mistral-small-latest',
                  },
                },
              },
            }
          : message,
      )
      expect((await run(path, sameSource)).bodies[0]).toEqual(bodies[0])
    },
  )
  it.each(['stream', 'structured'])(
    'replays foreign IDs, Unicode, and failed history through %s',
    async (path) => {
      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'Keep',
          toolCalls: [
            {
              id: 'y0biex7f9',
              type: 'function',
              function: { name: 'lookup', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'y0biex7f9', content: 'Done' },
        {
          role: 'assistant',
          content: 'Failed',
          metadata: { tanstack: { stopReason: 'error' } },
        },
        {
          role: 'assistant',
          content: 'Answer\ud800 😀',
          thinking: [{ content: 'Reason\udfff', signature: 'opaque' }],
          metadata: {
            tanstack: {
              source: { provider: 'other', api: 'other', model: 'other' },
            },
          },
          toolCalls: [
            {
              id: 'a.b.c',
              type: 'function',
              function: {
                name: 'lookup',
                arguments: '{"text":"bad\\ud800","n":9007199254740993}',
              },
            },
          ],
        },
        { role: 'tool', toolCallId: 'a.b.c', content: 'Result\ud800' },
      ]
      const original = structuredClone(messages)
      const { bodies } = await run(path, messages)
      expect(bodies[0]).toMatchObject({
        messages: [
          ordinaryMessages[0],
          {
            role: 'assistant',
            content: 'Keep',
            tool_calls: [{ id: 'y0biex7f9' }],
          },
          { role: 'tool', tool_call_id: 'y0biex7f9', content: 'Done' },
          {
            role: 'assistant',
            content: 'ReasonAnswer 😀',
            tool_calls: [
              {
                id: '144a7j62l',
                function: {
                  name: 'lookup',
                  arguments: '{"text":"bad","n":9007199254740993}',
                },
              },
            ],
          },
          { role: 'tool', tool_call_id: '144a7j62l', content: 'Result' },
        ],
      })
      expect(messages).toEqual(original)
    },
  )
  it.each(['stream', 'structured'])(
    'puts tool images inside %s tool content',
    async (path) => {
      const { bodies } = await run(path, [
        {
          role: 'tool',
          toolCallId: 'Abc123456',
          content: [
            { type: 'text', content: 'Image\ud800' },
            {
              type: 'image',
              source: { type: 'data', value: 'opaque', mimeType: 'image/png' },
            },
          ],
        },
      ])
      expect(bodies[0]).toMatchObject({
        messages: [
          { role: 'system', content: 'System' },
          {
            role: 'tool',
            tool_call_id: 'Abc123456',
            content: [
              { type: 'text', text: 'Image' },
              { type: 'image_url', image_url: 'data:image/png;base64,opaque' },
            ],
          },
        ],
      })
    },
  )
  it('uses the pi image placeholder for a text-only model', async () => {
    const { bodies } = await run(
      'stream',
      [
        {
          role: 'tool',
          toolCallId: 'Abc123456',
          error: 'failed',
          content: [
            {
              type: 'image',
              source: { type: 'data', value: 'opaque', mimeType: 'image/png' },
            },
          ],
        },
      ],
      'codestral-latest',
    )
    expect(bodies[0]).toMatchObject({
      messages: [
        { role: 'system', content: 'System' },
        {
          role: 'tool',
          tool_call_id: 'Abc123456',
          content: [
            {
              type: 'text',
              text: '[tool error] (image omitted: model does not support images)',
            },
          ],
        },
      ],
    })
  })
  it('returns genuine native response identity', async () => {
    expect((await run('structured', ordinary)).result).toMatchObject({
      responseId: 'response_actual',
      model: 'actual-model',
      data: { answer: 'ok' },
    })
  })
  it('tags the actual source and response identity in streams', async () => {
    const { chunks } = await run('stream', ordinary)
    expect(chunks.find((chunk) => chunk.type === 'RUN_STARTED')).toMatchObject({
      metadata: {
        tanstack: {
          source: {
            provider: 'mistral',
            api: 'mistral-conversations',
            model: 'mistral-small-latest',
          },
        },
      },
    })
    expect(chunks.find((chunk) => chunk.type === 'RUN_FINISHED')).toMatchObject(
      { responseId: 'response_actual', model: 'actual-model' },
    )
  })
  it('uses known Vertex credential context without URL guessing', async () => {
    transport()
    const adapter = mistralVertexText('mistral-small-2503', {
      getAccessToken: async () => 'token',
      resolveRequestUrl: () => 'https://gateway.example/chat',
    })
    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of adapter.chatStream(
      options([], 'mistral-small-2503'),
    ))
      chunks.push(chunk)
    expect(chunks.find((chunk) => chunk.type === 'RUN_STARTED')).toMatchObject({
      metadata: {
        tanstack: {
          source: {
            provider: 'google-vertex',
            api: 'mistral-conversations',
            model: 'mistral-small-2503',
          },
        },
      },
    })
  })
})

describe('Mistral empty terminal tool arguments', () => {
  // No input runs as {} (issue #265). The adapter fails on whitespace-only
  // arguments before the input check.
  it.each([
    { withSchema: true, raw: '', runs: 1 },
    { withSchema: true, raw: '   ', runs: 0 },
    { withSchema: false, raw: '', runs: 1 },
  ])('keeps empty raw input: %j', async ({ withSchema, raw, runs }) => {
    let requests = 0
    let executions = 0
    vi.stubGlobal('fetch', async () => {
      const packet =
        requests++ === 0
          ? {
              id: 'tool-response',
              model: 'mistral-small-latest',
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'Empty1234',
                        type: 'function',
                        function: { name: 'check', arguments: raw },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            }
          : {
              id: 'final-response',
              model: 'mistral-small-latest',
              choices: [
                { index: 0, delta: { content: 'done' }, finish_reason: 'stop' },
              ],
            }
      return new Response(
        'data: ' + JSON.stringify(packet) + '\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })
    const adapter = new MistralTextAdapter(
      { apiKey: 'key' },
      'mistral-small-latest',
    )
    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Check' }],
      tools: [
        {
          name: 'check',
          description: 'Check',
          ...(withSchema
            ? { inputSchema: { type: 'object' as const, properties: {} } }
            : {}),
          execute() {
            executions++
            return 'ok'
          },
        },
      ],
    }))
      chunks.push(chunk)
    expect(executions).toBe(runs)
    expect(
      chunks.find((chunk) => chunk.type === 'TOOL_CALL_END')?.metadata?.tanstack
        ?.args,
    ).toBe(raw)
  })
})

describe('Mistral terminal input projection', () => {
  it.each(['', undefined])(
    'does not repair empty or absent provider input: %j',
    async (raw) => {
      const packet = {
        id: 'tool-response',
        model: 'mistral-small-latest',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'Empty1234',
                  type: 'function',
                  function: {
                    name: 'check',
                    ...(raw === undefined ? {} : { arguments: raw }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }
      vi.stubGlobal(
        'fetch',
        async () =>
          new Response(
            'data: ' + JSON.stringify(packet) + '\n\ndata: [DONE]\n\n',
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      )
      const adapter = new MistralTextAdapter(
        { apiKey: 'key' },
        'mistral-small-latest',
      )
      const chunks: Array<AdapterYieldChunk> = []
      for await (const event of adapter.chatStream(options([])))
        chunks.push(event)
      const end = chunks.find((event) => event.type === 'TOOL_CALL_END')
      expect(end).toBeDefined()
      expect(end).not.toHaveProperty('input')
      if (raw === undefined) expect(end).not.toHaveProperty('args')
      else expect(end).toHaveProperty('args', raw)
    },
  )
})

describe('Mistral native structured generation identity', () => {
  it('keeps genuine response identity through outputSchema chat', async () => {
    transport()
    const adapter = new MistralTextAdapter(
      { apiKey: 'key' },
      'mistral-small-latest',
    )
    const chunks = []
    for await (const event of chat({
      adapter,
      stream: true,
      messages: [{ role: 'user', content: 'Answer' }],
      outputSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    }))
      chunks.push(event)
    expect(chunks.find((event) => event.type === 'RUN_FINISHED')).toMatchObject(
      {
        metadata: {
          tanstack: {
            responseId: 'response_actual',
            model: 'actual-model',
            source: {
              provider: 'mistral',
              api: 'mistral-conversations',
              model: 'mistral-small-latest',
            },
          },
        },
      },
    )
  })
})
