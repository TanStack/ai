import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { defineInterrupt } from '../src/interrupt-definition'
import {
  genericInterruptContinuationFromDescriptor,
  wrapGenericInterruptContinuation,
} from '../src/generic-interrupt-continuation'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { ModelMessage, SchemaInput, StreamChunk, Tool } from '../src/types'

const review = defineInterrupt({
  id: 'boundary-review',
  responseSchema: z.boolean(),
})
const client = (inputSchema: SchemaInput, needsApproval = false): Tool => ({
  name: 'check',
  description: 'Check input',
  inputSchema,
  needsApproval,
})
const history = (input: unknown): Array<ModelMessage> => [
  {
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id: 'call',
        type: 'function',
        function: { name: 'check', arguments: JSON.stringify(input) },
      },
    ],
  },
]
function descriptors(chunks: Array<StreamChunk>) {
  return chunks.flatMap((chunk) =>
    chunk.type === EventType.RUN_FINISHED && chunk.outcome?.type === 'interrupt'
      ? chunk.outcome.interrupts
      : [],
  )
}
async function initial(input: unknown, tool: Tool, hooks: ChatMiddleware = {}) {
  const { adapter } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.toolStart('call', 'check'),
        ev.toolArgs('call', JSON.stringify(input)),
        ev.runFinished('tool_calls'),
      ],
    ],
  })
  return collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'check' }],
      tools: [tool],
      interrupts: [review],
      middleware: [
        defineChatMiddleware({
          name: 'boundary',
          onInterruptBoundary(ctx) {
            if (ctx.phase === 'afterModel')
              return {
                interrupts: [
                  review.interrupt({
                    key: 'review',
                    reason: 'review',
                    message: 'Review',
                  }),
                ],
              }
            return undefined
          },
        }),
        hooks,
      ],
    }),
  )
}

describe('client input at interrupt boundaries', () => {
  it.each([false, true])(
    'retains an older resumed call edit without rewriting a later reused ID: %s',
    async (identical) => {
      const messages = history({ count: 1 })
      messages.push(
        { role: 'tool', toolCallId: 'call', content: '{"ok":true}' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call',
              type: 'function',
              function: {
                name: identical ? 'check' : 'other',
                arguments: identical ? '{"count":1}' : '{"count":9}',
              },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call', content: '{"ok":true}' },
      )
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished()]],
      })
      let saved: Array<ModelMessage> = []
      await collectChunks(
        chat({
          adapter,
          parentRunId: 'old',
          messages,
          tools: [
            client(z.object({ count: z.number() }), true),
            { ...client(z.object({ count: z.number() })), name: 'other' },
          ],
          middleware: [
            {
              onConfig(_ctx, config) {
                return {
                  ...config,
                  providerMessages: config.messages.map((message) =>
                    message.toolCalls
                      ? {
                          ...message,
                          toolCalls: message.toolCalls.map((call) => ({
                            ...call,
                            function: { ...call.function },
                          })),
                        }
                      : { ...message },
                  ),
                  resumeToolState: {
                    ...config.resumeToolState,
                    approvals: new Map([
                      ['call', { approved: true, editedArgs: { count: 2 } }],
                    ]),
                    clientToolResults: new Map([['call', { ok: true }]]),
                  },
                }
              },
              onChunk(ctx, chunk) {
                saved = [...ctx.messages]
                return chunk
              },
            },
          ],
        }),
      )
      expect(
        saved
          .flatMap((message) => message.toolCalls ?? [])
          .map((call) => call.function.arguments),
      ).toEqual(['{"count":2}', identical ? '{"count":1}' : '{"count":9}'])
      expect(
        calls[0]?.messages
          .flatMap((message) => message.toolCalls ?? [])
          .map((call) => call.function.arguments),
      ).toEqual(['{"count":2}', identical ? '{"count":1}' : '{"count":9}'])
      expect(messages[0]?.toolCalls?.[0]?.function.arguments).toBe(
        '{"count":1}',
      )
    },
  )
  it.each(['middleware', 'validator'])(
    'retains approved raw JSON before an in-place %s edit',
    async (kind) => {
      const edited = { count: 2 }
      const inputSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'mutation',
          jsonSchema: {
            input: () => ({ type: 'object' }),
            output: () => ({ type: 'object' }),
          },
          validate(value: unknown) {
            if (
              typeof value !== 'object' ||
              value === null ||
              !('count' in value)
            )
              return { issues: [{ message: 'Missing count' }] }
            if (kind === 'validator') value.count = 3
            return { value }
          },
        },
      }
      const { adapter } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished()]],
      })
      let saved: Array<ModelMessage> = []
      let executed = 0
      await collectChunks(
        chat({
          adapter,
          messages: history({ count: 1 }),
          tools: [
            {
              name: 'check',
              description: 'Check input',
              needsApproval: true,
              inputSchema,
              execute(value: unknown) {
                expect(value).toBe(edited)
                expect(edited.count).toBe(3)
                executed++
                return 'ok'
              },
            },
          ],
          middleware: [
            {
              onConfig(_ctx, config) {
                return {
                  ...config,
                  resumeToolState: {
                    approvals: new Map([
                      ['call', { approved: true, editedArgs: edited }],
                    ]),
                  },
                }
              },
              onBeforeToolCall(_ctx, hook) {
                if (
                  kind === 'middleware' &&
                  typeof hook.args === 'object' &&
                  hook.args !== null &&
                  'count' in hook.args
                )
                  hook.args.count = 3
              },
              onChunk(ctx, chunk) {
                saved = [...ctx.messages]
                return chunk
              },
            },
          ],
        }),
      )
      expect(executed).toBe(1)
      expect(saved[0]?.toolCalls?.[0]?.function.arguments).toBe('{"count":2}')
    },
  )
  it('keeps an earlier successful call unchanged when its ID is reused', async () => {
    const messages = history({ count: 1 })
    messages.push({ role: 'tool', toolCallId: 'call', content: 'old result' })
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('call', 'check'),
          ev.toolArgs('call', '{"count":3}'),
          ev.toolEnd('call'),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.runFinished()],
      ],
    })
    let saved: Array<ModelMessage> = []
    await collectChunks(
      chat({
        adapter,
        messages,
        tools: [
          {
            name: 'check',
            description: 'Check input',
            needsApproval: true,
            inputSchema: z.object({ count: z.number() }),
            execute: () => 'new result',
          },
        ],
        middleware: [
          {
            onConfig(_ctx, config) {
              return {
                ...config,
                resumeToolState: {
                  approvals: new Map([
                    ['call', { approved: true, editedArgs: { count: 2 } }],
                  ]),
                },
              }
            },
            onChunk(ctx, chunk) {
              saved = [...ctx.messages]
              return chunk
            },
          },
        ],
      }),
    )
    const calls = saved.flatMap((message) => message.toolCalls ?? [])
    expect(calls.map((call) => call.function.arguments)).toEqual([
      '{"count":1}',
      '{"count":2}',
    ])
    expect(messages[0]?.toolCalls?.[0]?.function.arguments).toBe('{"count":1}')
  })
  it.each(['function', 'bigint', 'cycle', 'toJSON', 'array subclass'])(
    'accepts approved opaque server input without transcript serialization: %s',
    async (kind) => {
      let serialized = 0
      class CustomArray extends Array<unknown> {
        toJSON() {
          serialized++
          return []
        }
      }
      const cycle: Record<string, unknown> = {}
      cycle.self = cycle
      const edited =
        kind === 'function'
          ? () => 1
          : kind === 'bigint'
            ? 1n
            : kind === 'cycle'
              ? cycle
              : kind === 'array subclass'
                ? new CustomArray()
                : {
                    toJSON() {
                      serialized++
                      return {}
                    },
                  }
      let checked = 0
      const received: Array<unknown> = []
      const inputSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'opaque',
          jsonSchema: { input: () => ({}), output: () => ({}) },
          validate(value: unknown) {
            checked++
            expect(value).toBe(edited)
            return { value }
          },
        },
      }
      const { adapter } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished()]],
      })
      let saved: Array<ModelMessage> = []
      const original = history({ count: 1 })
      await collectChunks(
        chat({
          adapter,
          parentRunId: 'old',
          messages: original,
          tools: [
            {
              name: 'check',
              description: 'Check input',
              needsApproval: true,
              inputSchema,
              execute: (value: unknown) => {
                received.push(value)
                return 'ok'
              },
            },
          ],
          middleware: [
            {
              onConfig(_ctx, config) {
                return {
                  ...config,
                  resumeToolState: {
                    approvals: new Map([
                      ['call', { approved: true, editedArgs: edited }],
                    ]),
                  },
                }
              },
              onChunk(ctx, chunk) {
                saved = [...ctx.messages]
                return chunk
              },
            },
          ],
        }),
      )
      expect(received).toEqual([edited])
      expect(checked).toBe(1)
      expect(serialized).toBe(0)
      expect(saved[0]?.toolCalls?.[0]?.function.arguments).toBe('{"count":1}')
    },
  )

  it('executes an earlier physical segment after a generic continuation', async () => {
    let executed = 0
    let saved: Array<ModelMessage> = []
    const tool: Tool = {
      name: 'check',
      description: 'Check input',
      inputSchema: { type: 'object' },
      execute() {
        executed++
        return 'ok'
      },
    }
    const first = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('call', 'check'),
          ev.toolArgs('call', '{}'),
          ev.toolEnd('call'),
          {
            ...ev.toolStart('provider', 'search'),
            metadata: { providerExecuted: true },
          },
          ev.toolArgs('provider', '{}'),
          ev.toolEnd('provider'),
          {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: 'thinking',
            delta: 'Later thinking',
            timestamp: Date.now(),
          },
          ev.runFinished('tool_calls'),
        ],
      ],
    })
    const paused = await collectChunks(
      chat({
        adapter: first.adapter,
        runId: 'segmented',
        messages: [{ role: 'user', content: 'check' }],
        tools: [tool],
        interrupts: [review],
        middleware: [
          defineChatMiddleware({
            name: 'pause',
            onInterruptBoundary(ctx) {
              if (ctx.phase === 'afterModel')
                return {
                  interrupts: [
                    review.interrupt({
                      key: 'review',
                      reason: 'review',
                      message: 'Review',
                    }),
                  ],
                }
              return undefined
            },
            onChunk(ctx, chunk) {
              saved = [...ctx.messages]
              return chunk
            },
          }),
        ],
      }),
    )
    expect(
      saved.filter((message) => message.role === 'assistant'),
    ).toHaveLength(2)
    const descriptor = descriptors(paused).find(
      (entry) =>
        genericInterruptContinuationFromDescriptor(entry) !== undefined,
    )
    if (!descriptor) throw new Error('Missing generic interrupt')
    const continuation = genericInterruptContinuationFromDescriptor(descriptor)
    if (!continuation) throw new Error('Missing continuation')
    const next = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished()]],
    })
    await collectChunks(
      chat({
        adapter: next.adapter,
        parentRunId: 'segmented',
        messages: saved,
        tools: [tool],
        interrupts: [review],
        resume: [
          {
            interruptId: descriptor.id,
            status: 'resolved',
            payload: true,
            metadata: wrapGenericInterruptContinuation(continuation),
          },
        ],
      }),
    )
    expect(executed).toBe(1)
  })
  it('keeps approved raw edits for the later client-result resume', async () => {
    const first = createMockAdapter({ iterations: [] })
    let transforms = 0
    const schema = z.object({
      count: z.number().transform((value) => {
        transforms++
        return value + 1
      }),
    })
    const tool = client(schema, true)
    let saved: Array<ModelMessage> = []
    const original = history({ count: 1 })
    original[0]?.toolCalls?.push({
      id: 'earlier',
      type: 'function',
      function: { name: 'check', arguments: ' { "count": 10.00 } ' },
    })
    original.push({
      role: 'tool',
      toolCallId: 'earlier',
      content: '{"ok":true}',
    })
    await collectChunks(
      chat({
        adapter: first.adapter,
        runId: 'phase-two',
        parentRunId: 'old',
        messages: original,
        tools: [tool],
        resume: [
          {
            interruptId: 'approval_call',
            status: 'resolved',
            payload: { approved: true, editedArgs: { count: '2' } },
          },
        ],
        middleware: [
          {
            onChunk(ctx, chunk) {
              saved = [...ctx.messages]
              return chunk
            },
          },
        ],
      }),
    )
    expect(saved[0]?.toolCalls?.[0]?.function.arguments).toBe('{"count":"2"}')
    expect(original[0]?.toolCalls?.[0]?.function.arguments).toBe('{"count":1}')
    expect(saved[0]?.toolCalls?.[1]?.function.arguments).toBe(
      ' { "count": 10.00 } ',
    )
    transforms = 0
    const seen: Array<unknown> = []
    const final = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished()]],
    })
    const chunks = await collectChunks(
      chat({
        adapter: final.adapter,
        parentRunId: 'phase-two',
        messages: saved,
        tools: [tool],
        resume: [
          {
            interruptId: 'client_tool_call',
            status: 'resolved',
            payload: { ok: true },
          },
        ],
        middleware: [
          {
            onBeforeToolCall(_ctx, hook) {
              seen.push(hook.args)
            },
          },
        ],
      }),
    )
    expect(seen).toEqual([{ count: '2' }])
    expect(transforms).toBe(1)
    expect(descriptors(chunks)).toEqual([])
  })
  it('keeps original argument bytes when approval has no edit', async () => {
    const { adapter } = createMockAdapter({ iterations: [] })
    const messages = history({ count: 1 })
    const originalArgs = ' { "count" : 1.00 } '
    const call = messages[0]?.toolCalls?.[0]
    if (!call) throw new Error('Expected tool call')
    call.function.arguments = originalArgs
    let saved: Array<ModelMessage> = []
    await collectChunks(
      chat({
        adapter,
        parentRunId: 'old',
        messages,
        tools: [client(z.object({ count: z.number() }), true)],
        resume: [
          { interruptId: 'approval_call', status: 'resolved', payload: true },
        ],
        middleware: [
          {
            onChunk(ctx, chunk) {
              saved = [...ctx.messages]
              return chunk
            },
          },
        ],
      }),
    )
    expect(saved[0]?.toolCalls?.[0]?.function.arguments).toBe(originalArgs)
  })
  it.each([
    ['2', 2],
    [null, 0],
  ])(
    'checks original primitive input before the initial descriptor: %#',
    async (input, expected) => {
      const chunks = await initial(input, client({ type: 'integer' }))
      expect(
        descriptors(chunks).find((entry) => entry.id === 'client_tool_call')
          ?.metadata?.input,
      ).toBe(expected)
    },
  )
  it.each(['wrong', null, 2])(
    'rejects wrong object input without a client descriptor: %#',
    async (input) => {
      const chunks = await initial(
        input,
        client({
          type: 'object',
          required: ['count'],
          properties: { count: { type: 'number' } },
        }),
      )
      expect(
        descriptors(chunks).some((entry) => entry.id === 'client_tool_call'),
      ).toBe(false)
      expect(
        chunks.some(
          (entry) =>
            entry.type === EventType.TOOL_CALL_RESULT &&
            typeof entry.content === 'string' &&
            entry.content.includes('Input validation failed'),
        ),
      ).toBe(true)
    },
  )
  it('runs middleware on raw input then transforms once for the initial descriptor', async () => {
    let transforms = 0
    const seen: Array<unknown> = []
    const schema = z.object({
      count: z.string().transform((value) => {
        transforms++
        return Number(value)
      }),
    })
    const chunks = await initial({ count: '2' }, client(schema), {
      onBeforeToolCall(_ctx, hook) {
        seen.push(hook.args)
      },
    })
    expect(seen).toEqual([{ count: '2' }])
    expect(transforms).toBe(1)
    expect(
      descriptors(chunks).find((entry) => entry.id === 'client_tool_call')
        ?.metadata?.input,
    ).toEqual({ count: 2 })
  })
  it.each([false, true])(
    'rejects replacement and in-place middleware edits: %s',
    async (replace) => {
      const chunks = await initial(
        { count: 2 },
        client({
          type: 'object',
          required: ['count'],
          properties: { count: { type: 'number' } },
        }),
        {
          onBeforeToolCall(_ctx, hook) {
            if (replace)
              return { type: 'transformArgs', args: { count: 'wrong' } }
            if (
              hook.args &&
              typeof hook.args === 'object' &&
              'count' in hook.args
            )
              hook.args.count = 'wrong'
            return undefined
          },
        },
      )
      expect(
        descriptors(chunks).some((entry) => entry.id === 'client_tool_call'),
      ).toBe(false)
    },
  )
  it('keeps the checked pending approval preview separate from execution', async () => {
    let hooks = 0
    const chunks = await initial(
      { count: '2' },
      client(z.object({ count: z.string().transform(Number) }), true),
      {
        onBeforeToolCall() {
          hooks++
        },
      },
    )
    expect(hooks).toBe(0)
    expect(
      descriptors(chunks).find((entry) => entry.id === 'approval_call')
        ?.metadata?.input,
    ).toEqual({ count: 2 })
    expect(
      descriptors(chunks).some((entry) => entry.id === 'client_tool_call'),
    ).toBe(false)
  })
  it('checks approved edits after middleware on ephemeral resume', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [] })
    const seen: Array<unknown> = []
    let transforms = 0
    const schema = z.object({
      count: z.number().transform((value) => {
        transforms++
        return value + 1
      }),
    })
    const chunks = await collectChunks(
      chat({
        adapter,
        parentRunId: 'old',
        messages: history({ count: 1 }),
        tools: [client(schema, true)],
        resume: [
          {
            interruptId: 'approval_call',
            status: 'resolved',
            payload: { approved: true, editedArgs: { count: '2' } },
          },
        ],
        middleware: [
          {
            onBeforeToolCall(_ctx, hook) {
              seen.push(hook.args)
            },
          },
        ],
      }),
    )
    expect(calls).toHaveLength(0)
    expect(seen).toEqual([{ count: '2' }])
    expect(transforms).toBe(1)
    expect(
      descriptors(chunks).find((entry) => entry.id === 'client_tool_call')
        ?.metadata?.input,
    ).toEqual({ count: 3 })
  })
  it('runs no middleware or client dispatch for denied ephemeral approval', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished()]],
    })
    let hooks = 0
    const chunks = await collectChunks(
      chat({
        adapter,
        parentRunId: 'old',
        messages: history({ count: 1 }),
        tools: [client(z.object({ count: z.number() }), true)],
        resume: [
          { interruptId: 'approval_call', status: 'resolved', payload: false },
        ],
        middleware: [
          {
            onBeforeToolCall() {
              hooks++
            },
          },
        ],
      }),
    )
    expect(hooks).toBe(0)
    expect(
      descriptors(chunks).some((entry) => entry.id === 'client_tool_call'),
    ).toBe(false)
  })
  it.each([false, true])(
    'checks client resume input even when a result is already written: %s',
    async (written) => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished()]],
      })
      const messages = history({ count: 'wrong' })
      if (written)
        messages.push({
          role: 'tool',
          toolCallId: 'call',
          content: '{"ok":true}',
        })
      let hooks = 0
      const chunks = await collectChunks(
        chat({
          adapter,
          parentRunId: 'old',
          messages,
          tools: [client(z.object({ count: z.number() }))],
          resume: [
            {
              interruptId: 'client_tool_call',
              status: 'resolved',
              payload: { ok: true },
            },
          ],
          middleware: [
            {
              onBeforeToolCall() {
                hooks++
              },
            },
          ],
        }),
      )
      expect(hooks).toBe(1)
      expect(
        descriptors(chunks).some((entry) => entry.id === 'client_tool_call'),
      ).toBe(false)
      expect(
        chunks.some(
          (entry) =>
            entry.type === EventType.TOOL_CALL_RESULT &&
            typeof entry.content === 'string' &&
            entry.content.includes('Input validation failed'),
        ),
      ).toBe(true)
      const results = calls[0]?.messages.filter(
        (message) => message.role === 'tool',
      )
      expect(results).toHaveLength(1)
      expect(results?.[0]?.error).toContain('Input validation failed')
    },
  )
  it.each([false, true])(
    'validates and transforms a resumed client input once: %s',
    async (written) => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished()]],
      })
      let transforms = 0
      const schema = z.object({
        count: z.string().transform((value) => {
          transforms++
          return Number(value)
        }),
      })
      const messages = history({ count: '2' })
      if (written)
        messages.push({
          role: 'tool',
          toolCallId: 'call',
          content: '{"ok":true}',
        })
      const seen: Array<unknown> = []
      await collectChunks(
        chat({
          adapter,
          parentRunId: 'old',
          messages,
          tools: [client(schema)],
          resume: [
            {
              interruptId: 'client_tool_call',
              status: 'resolved',
              payload: { ok: true },
            },
          ],
          middleware: [
            {
              onBeforeToolCall(_ctx, hook) {
                seen.push(hook.args)
              },
            },
          ],
        }),
      )
      expect(seen).toEqual([{ count: '2' }])
      expect(transforms).toBe(1)
      expect(
        calls[0]?.messages.filter((message) => message.role === 'tool'),
      ).toEqual([{ role: 'tool', toolCallId: 'call', content: '{"ok":true}' }])
    },
  )
})

describe('empty schema-bearing client arguments', () => {
  it.each([false, true])(
    'does not dispatch an empty client or approval call: approval=%s',
    async (needsApproval) => {
      for (const raw of ['', '  ']) {
        const { adapter } = createMockAdapter({
          iterations: [
            [
              ev.runStarted(),
              ev.toolStart('empty', 'check'),
              {
                type: EventType.TOOL_CALL_END,
                toolCallId: 'empty',
                args: raw,
                timestamp: 0,
              },
              ev.runFinished('tool_calls'),
            ],
            [ev.runStarted('second'), ev.runFinished()],
          ],
        })
        const chunks = await collectChunks(
          chat({
            adapter,
            messages: [{ role: 'user', content: 'Check' }],
            tools: [client({ type: 'object', properties: {} }, needsApproval)],
          }),
        )
        expect(descriptors(chunks)).toEqual([])
        expect(
          chunks.some(
            (event) =>
              event.type === EventType.TOOL_CALL_RESULT ||
              event.type === EventType.RUN_ERROR,
          ),
        ).toBe(true)
      }
    },
  )
  it.each([false, true])(
    'rejects copied empty historical arguments before resumed client dispatch: approval=%s',
    async (needsApproval) => {
      for (const raw of ['', '  ']) {
        const messages: Array<ModelMessage> = [
          {
            role: 'assistant',
            content: null,
            toolCalls: [
              {
                id: 'empty',
                type: 'function',
                function: { name: 'check', arguments: raw },
              },
            ],
          },
        ]
        const { adapter } = createMockAdapter({
          iterations: [[ev.runStarted(), ev.runFinished()]],
        })
        const chunks = await collectChunks(
          chat({
            adapter,
            parentRunId: 'prior',
            messages: JSON.parse(JSON.stringify(messages)),
            tools: [client({ type: 'object', properties: {} }, needsApproval)],
          }),
        )
        expect(descriptors(chunks)).toEqual([])
        expect(messages[0]?.toolCalls?.[0]?.function.arguments).toBe(raw)
      }
    },
  )
})
