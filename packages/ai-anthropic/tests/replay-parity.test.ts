import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { AnthropicTextAdapter } from '../src/adapters/text'
import type { AnthropicTextConfig } from '../src/adapters/text'
import { createSilentLogger } from './utils/logger'
import type { ModelMessage } from '@tanstack/ai'

function transport() {
  const bodies: Array<unknown> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const body: unknown = await request.json()
    bodies.push(body)
    if (
      body !== null &&
      typeof body === 'object' &&
      'stream' in body &&
      body.stream === false
    )
      return Response.json({
        id: 'msg_actual',
        model: 'claude-sonnet-5-actual',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'structured',
            name: 'structured_output',
            input: { answer: 'ok' },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    const events = [
      {
        type: 'message_start',
        message: {
          id: 'msg_actual',
          model: 'claude-sonnet-5-actual',
          role: 'assistant',
          type: 'message',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 1 },
      },
      { type: 'message_stop' },
    ]
    return new Response(
      events
        .map(
          (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        )
        .join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  }
  return { fetch, bodies }
}

async function replay(
  messages: Array<ModelMessage>,
  config: AnthropicTextConfig = { apiKey: 'test-key' },
) {
  const io = transport()
  const adapter = new AnthropicTextAdapter(
    { ...config, fetch: io.fetch },
    'claude-sonnet-5',
  )
  const chunks = []
  for await (const chunk of adapter.chatStream({
    model: 'claude-sonnet-5',
    messages,
    modelOptions: { max_tokens: 128 },
    logger: createSilentLogger(),
    systemPrompts: ['System\ud800 😀'],
  }))
    chunks.push(chunk)
  return { ...io, chunks, adapter }
}

describe('Anthropic replay parity', () => {
  it.each(['chat', 'structured'])(
    'keeps collapsed cleanup boundaries inline for %s requests',
    async (path) => {
      const messages: Array<ModelMessage> = [
        { role: 'user', content: 'Start' },
        {
          role: 'assistant',
          content: 'Failed',
          metadata: { tanstack: { stopReason: 'error' } },
        },
        {
          role: 'assistant',
          content: 'Aborted',
          metadata: { tanstack: { stopReason: 'aborted' } },
        },
        { role: 'assistant', content: 'Answer' },
        { role: 'user', content: 'Follow' },
      ]
      const original = structuredClone(messages)
      const midConversationChanges = {
        start: { tools: ['lookup'], systemPrompts: 1 },
        changes: [
          { before: 1, tools: ['first'], systemPrompts: 1 },
          { before: 2, tools: ['second'], systemPrompts: 1 },
        ],
      }
      const io = transport()
      const adapter = new AnthropicTextAdapter(
        { apiKey: 'key', fetch: io.fetch, midConversationChannels: true },
        'claude-opus-5',
      )
      const options = {
        model: 'claude-opus-5',
        messages,
        tools: [
          { name: 'lookup', description: 'Lookup' },
          { name: 'first', description: 'First' },
          { name: 'second', description: 'Second' },
        ],
        systemPrompts: ['Global', 'Inline one', 'Inline two'],
        midConversationChanges,
        modelOptions: { max_tokens: 128 },
        logger: createSilentLogger(),
      }
      if (path === 'chat') {
        for await (const chunk of adapter.chatStream(options))
          expect(chunk.type).not.toBe(EventType.RUN_ERROR)
      } else
        expect(
          (
            await adapter.structuredOutput({
              chatOptions: options,
              outputSchema: {
                type: 'object',
                properties: { answer: { type: 'string' } },
              },
            })
          ).data,
        ).toEqual({ answer: 'ok' })
      expect(io.bodies[0]).toMatchObject({
        system: [{ type: 'text', text: 'Global' }],
        messages: [
          { role: 'user', content: 'Start' },
          {
            role: 'system',
            content: [
              { type: 'text', text: 'Inline one' },
              { type: 'text', text: 'Inline two' },
              {
                type: 'tool_addition',
                tool: { type: 'tool_reference', name: 'first' },
              },
              {
                type: 'tool_addition',
                tool: { type: 'tool_reference', name: 'second' },
              },
            ],
          },
          { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] },
          { role: 'user', content: 'Follow' },
        ],
      })
      expect(messages).toEqual(original)
      expect(midConversationChanges).toEqual({
        start: { tools: ['lookup'], systemPrompts: 1 },
        changes: [
          { before: 1, tools: ['first'], systemPrompts: 1 },
          { before: 2, tools: ['second'], systemPrompts: 1 },
        ],
      })
    },
  )
  it('turns foreign thinking into text and sanitizes all request text', async () => {
    const { bodies, chunks } = await replay([
      {
        role: 'assistant',
        content: 'Answer\ud800 😀',
        thinking: [{ content: 'Reason\udfff', signature: 'foreign-signature' }],
        metadata: {
          tanstack: {
            source: { provider: 'other', api: 'other', model: 'other' },
          },
        },
        toolCalls: [
          {
            id: 'foreign.id',
            type: 'function',
            function: { name: 'lookup', arguments: '{"text":"bad\\ud800"}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'foreign.id', content: 'Result\udfff' },
    ])
    expect(bodies).toEqual([
      {
        model: 'claude-sonnet-5',
        max_tokens: 128,
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'ReasonAnswer 😀' },
              {
                type: 'tool_use',
                id: 'foreign_id',
                name: 'lookup',
                input: { text: 'bad' },
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'foreign_id',
                content: 'Result',
              },
            ],
          },
        ],
        system: [{ type: 'text', text: 'System 😀' }],
        stream: true,
      },
    ])
    expect(
      chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED),
    ).toMatchObject({
      responseId: 'msg_actual',
      model: 'claude-sonnet-5-actual',
    })
    expect(
      chunks.find((chunk) => chunk.type === EventType.RUN_STARTED),
    ).toMatchObject({
      metadata: {
        tanstack: {
          source: {
            provider: 'anthropic',
            api: 'anthropic-messages',
            model: 'claude-sonnet-5',
          },
        },
      },
    })
  })

  it('keeps unsigned thinking only with the explicit option', async () => {
    const messages: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: 'Answer',
        thinking: [{ content: 'Reason' }, { content: '', redacted: true }],
      },
    ]
    const { bodies } = await replay(messages, {
      apiKey: 'key',
      allowEmptySignature: true,
    })
    expect(bodies).toEqual([
      {
        model: 'claude-sonnet-5',
        max_tokens: 128,
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Reason', signature: '' },
              { type: 'text', text: 'Answer' },
            ],
          },
        ],
        system: [{ type: 'text', text: 'System 😀' }],
        stream: true,
      },
    ])
  })

  it('reserves same-source IDs and allocates unique max-64 foreign IDs', async () => {
    const source = {
      provider: 'anthropic',
      api: 'anthropic-messages',
      model: 'claude-sonnet-5',
    }
    const foreign = {
      provider: 'gateway',
      api: 'anthropic-messages',
      model: 'claude-sonnet-5',
    }
    const id = 'a'.repeat(64)
    const call = (value: string) => ({
      id: value,
      type: 'function' as const,
      function: { name: 'lookup', arguments: '{}' },
    })
    const { bodies } = await replay([
      {
        role: 'assistant',
        content: '',
        toolCalls: [call(id)],
        metadata: { tanstack: { source } },
      },
      { role: 'tool', toolCallId: id, content: 'first' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [call(`${id}.one`), call(`${id}.two`)],
        metadata: { tanstack: { source: foreign } },
      },
      { role: 'tool', toolCallId: `${id}.one`, content: 'second' },
      { role: 'tool', toolCallId: `${id}.two`, content: 'third' },
    ])
    const body = bodies[0]
    expect(body).toEqual(
      expect.objectContaining({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id, name: 'lookup', input: {} }],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: id, content: 'first' },
            ],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: `${'a'.repeat(62)}_1`,
                name: 'lookup',
                input: {},
              },
              {
                type: 'tool_use',
                id: `${'a'.repeat(62)}_2`,
                name: 'lookup',
                input: {},
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: `${'a'.repeat(62)}_1`,
                content: 'second',
              },
              {
                type: 'tool_result',
                tool_use_id: `${'a'.repeat(62)}_2`,
                content: 'third',
              },
            ],
          },
        ],
      }),
    )
  })

  it('uses the explicit gateway identity without guessing from the URL', async () => {
    const { adapter, chunks } = await replay(
      [{ role: 'user', content: 'Hello' }],
      {
        apiKey: 'key',
        provider: 'gateway',
        baseURL: 'https://gateway.example',
      },
    )
    expect(adapter.provider).toBe('gateway')
    expect(adapter.api).toBe('anthropic-messages')
    expect(
      chunks.find((chunk) => chunk.type === EventType.RUN_STARTED),
    ).toMatchObject({
      metadata: {
        tanstack: {
          source: {
            provider: 'gateway',
            api: 'anthropic-messages',
            model: 'claude-sonnet-5',
          },
        },
      },
    })
  })

  it('keeps the ordinary signed and redacted request unchanged', async () => {
    const { bodies } = await replay([
      {
        role: 'assistant',
        content: 'Answer',
        thinking: [
          { content: 'Reason', signature: 'signed' },
          { content: '', signature: 'opaque', redacted: true },
        ],
      },
    ])
    expect(bodies).toEqual([
      {
        model: 'claude-sonnet-5',
        max_tokens: 128,
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Reason', signature: 'signed' },
              { type: 'redacted_thinking', data: 'opaque' },
              { type: 'text', text: 'Answer' },
            ],
          },
        ],
        system: [{ type: 'text', text: 'System 😀' }],
        stream: true,
      },
    ])
  })

  it('preserves interleaved foreign thinking and tool block order', async () => {
    const { bodies } = await replay([
      {
        role: 'assistant',
        content: 'BeforeAfter',
        thinking: [{ content: 'Reason', signature: 'foreign' }],
        toolCalls: [
          {
            id: 'foreign.id',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
        blockOrder: [
          { type: 'text', length: 6 },
          { type: 'tool-call', id: 'foreign.id' },
          { type: 'thinking', index: 0 },
          { type: 'text', length: 5 },
        ],
        metadata: {
          tanstack: {
            source: { provider: 'other', api: 'other', model: 'other' },
          },
        },
      },
      { role: 'tool', toolCallId: 'foreign.id', content: 'Result' },
    ])
    expect(bodies).toEqual([
      {
        model: 'claude-sonnet-5',
        max_tokens: 128,
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Before' },
              { type: 'tool_use', id: 'foreign_id', name: 'lookup', input: {} },
              { type: 'text', text: 'ReasonAfter' },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'foreign_id',
                content: 'Result',
              },
            ],
          },
        ],
        system: [{ type: 'text', text: 'System 😀' }],
        stream: true,
      },
    ])
  })
})

describe('Anthropic initial tool input snapshots', () => {
  it.each([
    {
      initial: null,
      delta: undefined,
      expected: null,
      schema: { type: 'null' as const },
    },
    {
      initial: 2,
      delta: undefined,
      expected: 2,
      schema: { type: 'number' as const },
    },
    {
      initial: { value: 'start' },
      delta: undefined,
      expected: { value: 'start' },
      schema: { type: 'object' as const },
    },
    {
      initial: {},
      delta: '2',
      expected: 2,
      schema: { type: 'number' as const },
    },
    {
      initial: { value: 'start' },
      delta: '2',
      expected: 2,
      schema: { type: 'number' as const },
    },
    {
      initial: {},
      delta: '[1,null]',
      expected: [1, null],
      schema: { type: 'array' as const },
    },
    {
      initial: {},
      delta: '{"broken":',
      expected: undefined,
      schema: { type: 'object' as const },
    },
  ])(
    'validates the actual SDK terminal input: %j',
    async ({ initial, delta, expected, schema }) => {
      let requests = 0
      let executions = 0
      let received: unknown
      const fallback = transport()
      const fetch: typeof globalThis.fetch = async (input, init) => {
        if (requests++ > 0) return fallback.fetch(input, init)
        const events = [
          {
            type: 'message_start',
            message: {
              id: 'tool-message',
              model: 'claude-sonnet-5',
              type: 'message',
              role: 'assistant',
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 0 },
            },
          },
          {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'input-call',
              name: 'check',
              input: initial,
            },
          },
          ...(delta === undefined
            ? []
            : [
                {
                  type: 'content_block_delta',
                  index: 0,
                  delta: { type: 'input_json_delta', partial_json: delta },
                },
              ]),
          { type: 'content_block_stop', index: 0 },
          {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use', stop_sequence: null },
            usage: { output_tokens: 1 },
          },
          { type: 'message_stop' },
        ]
        return new Response(
          events
            .map(
              (event) =>
                'event: ' +
                event.type +
                '\ndata: ' +
                JSON.stringify(event) +
                '\n\n',
            )
            .join(''),
          { headers: { 'content-type': 'text/event-stream' } },
        )
      }
      const adapter = new AnthropicTextAdapter(
        { apiKey: 'key', fetch },
        'claude-sonnet-5',
      )
      const chunks = []
      for await (const event of chat({
        adapter,
        messages: [{ role: 'user', content: 'Check' }],
        tools: [
          {
            name: 'check',
            description: 'Check',
            inputSchema: schema,
            execute(value: unknown) {
              executions++
              received = value
              return 'ok'
            },
          },
        ],
      }))
        chunks.push(event)
      expect(executions).toBe(expected === undefined ? 0 : 1)
      expect(received).toEqual(expected)
      const end = chunks.find((event) => event.type === EventType.TOOL_CALL_END)
      expect(end?.metadata?.tanstack?.args).toBe(
        delta ?? JSON.stringify(initial),
      )
    },
  )
})
