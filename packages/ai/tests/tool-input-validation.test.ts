import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { defineInterrupt } from '../src/interrupt-definition'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import { otelMiddleware } from '../src/middlewares/otel'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import { createFakeMeter, createFakeTracer } from './middlewares/fake-otel'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { ToolExecutionMiddlewareHooks } from '../src/activities/chat/tools/tool-calls'
import type { ToolApprovalResolution } from '../src/interrupts'
import type {
  ModelMessage,
  SchemaInput,
  StreamChunk,
  Tool,
  ToolCall,
} from '../src/types'

const schema = z.object({ count: z.number().int().min(1) })

async function runTool(
  rawArguments: string,
  inputSchema: SchemaInput,
  options: {
    client?: boolean
    needsApproval?: boolean
    approvals?: Map<string, ToolApprovalResolution>
    middleware?: ToolExecutionMiddlewareHooks
    clientResults?: Map<string, unknown>
  } = {},
) {
  const executed: Array<unknown> = []
  const tool: Tool = {
    name: 'check',
    description: 'Check input',
    inputSchema,
    needsApproval: options.needsApproval,
    ...(options.client
      ? {}
      : {
          execute: (input: unknown) => {
            executed.push(input)
            return input
          },
        }),
  }
  const call: ToolCall = {
    id: 'call-1',
    type: 'function',
    function: { name: 'check', arguments: rawArguments },
  }
  const generator = executeToolCalls(
    [call],
    [tool],
    options.approvals,
    options.clientResults,
    undefined,
    options.middleware,
  )
  while (true) {
    const next = await generator.next()
    if (next.done) return { ...next.value, executed }
  }
}

describe('final tool input validation', () => {
  it('awaits an async Standard Schema validator', async () => {
    const asyncSchema: StandardSchemaV1<unknown, { count: number }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) =>
          typeof value === 'object' &&
          value !== null &&
          'count' in value &&
          typeof value.count === 'number'
            ? { value: { count: value.count * 10 } }
            : { issues: [{ message: 'count must be a number' }] },
      },
    }
    const ok = await runTool('{"count":2}', asyncSchema)
    expect(ok.executed).toEqual([{ count: 20 }])
    const bad = await runTool('{"count":"2"}', asyncSchema)
    expect(bad.executed).toEqual([])
    expect(bad.results[0]?.state).toBe('output-error')
    expect(bad.results[0]?.result).toEqual({
      error: expect.stringContaining('count must be a number'),
    })
  })

  it('includes the received arguments in the error', async () => {
    const result = await runTool('{"count":0}', schema)
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('Input validation failed for tool check'),
    })
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('"count": 0'),
    })
    expect(result.executed).toEqual([])
  })

  it('keeps empty and null arguments as {}', async () => {
    for (const raw of ['', '  ', 'null']) {
      const result = await runTool(raw, z.object({}))
      expect(result.executed).toEqual([{}])
    }
  })

  it.each([false, true])(
    'rejects a middleware replacement before server or client execution: client=%s',
    async (client) => {
      const result = await runTool('{"count":2}', schema, {
        client,
        middleware: {
          onBeforeToolCall: async () => ({
            type: 'transformArgs',
            args: { count: 'wrong' },
          }),
        },
      })
      expect(result.results[0]?.state).toBe('output-error')
      expect(result.executed).toEqual([])
      expect(result.needsClientExecution).toEqual([])
    },
  )

  it('rejects a middleware edit made in place', async () => {
    const result = await runTool('{"count":2}', schema, {
      middleware: {
        onBeforeToolCall: async (_call, _tool, input) => {
          if (typeof input === 'object' && input !== null)
            Reflect.set(input, 'count', 'wrong')
        },
      },
    })
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.executed).toEqual([])
  })

  it('runs onAfterToolCall with the validation error', async () => {
    const after: Array<boolean> = []
    await runTool('{"count":2}', schema, {
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: 'wrong' },
        }),
        onAfterToolCall: async (info) => {
          after.push(info.ok)
        },
      },
    })
    expect(after).toEqual([false])
  })

  it('lets middleware repair invalid input', async () => {
    const result = await runTool('{"count":"wrong"}', schema, {
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: 4 },
        }),
      },
    })
    expect(result.executed).toEqual([{ count: 4 }])
  })

  it('shows middleware the raw input and runs a transform once', async () => {
    const seen: Array<unknown> = []
    let transforms = 0
    const inputSchema = z.object({
      count: z.string().transform((value) => {
        transforms++
        return Number(value)
      }),
    })
    const result = await runTool('{"count":"2"}', inputSchema, {
      middleware: {
        onBeforeToolCall: async (_call, _tool, input) => {
          seen.push(structuredClone(input))
        },
      },
    })
    expect(seen).toEqual([{ count: '2' }])
    expect(result.executed).toEqual([{ count: 2 }])
    expect(transforms).toBe(1)
  })

  it('sends the checked middleware input to the client', async () => {
    const result = await runTool('{"count":2}', schema, {
      client: true,
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: 5 },
        }),
      },
    })
    expect(result.needsClientExecution).toEqual([
      { toolCallId: 'call-1', toolName: 'check', input: { count: 5 } },
    ])
  })

  it.each([false, true])(
    'checks an approval edit for a client tool: resumed=%s',
    async (resumed) => {
      const result = await runTool('{"count":2}', schema, {
        client: true,
        needsApproval: true,
        approvals: new Map([
          ['call-1', { approved: true, editedArgs: { count: 'wrong' } }],
        ]),
        clientResults: resumed
          ? new Map([['call-1', 'client result']])
          : new Map(),
      })
      expect(result.results[0]?.state).toBe('output-error')
      expect(result.needsClientExecution).toEqual([])
    },
  )

  it('rejects an invalid approval edit for a server tool', async () => {
    const result = await runTool('{"count":2}', schema, {
      needsApproval: true,
      approvals: new Map([
        ['call-1', { approved: true, editedArgs: { count: 0 } }],
      ]),
    })
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.executed).toEqual([])
  })

  it.each([false, true])(
    'keeps the transformed approval edit: client=%s',
    async (client) => {
      const result = await runTool('"2"', z.string().transform(Number), {
        client,
        needsApproval: true,
        approvals: new Map([['call-1', { approved: true, editedArgs: '4' }]]),
      })
      if (client) {
        expect(result.needsClientExecution).toEqual([
          { toolCallId: 'call-1', toolName: 'check', input: 4 },
        ])
      } else {
        expect(result.executed).toEqual([4])
      }
    },
  )

  it.each([false, true])(
    'runs no middleware and dispatches nothing while approval is pending: client=%s',
    async (client) => {
      let middlewareCalls = 0
      const result = await runTool('{"count":2}', schema, {
        client,
        needsApproval: true,
        middleware: {
          onBeforeToolCall: async () => {
            middlewareCalls++
          },
        },
      })
      expect(result.needsApproval).toEqual([
        {
          toolCallId: 'call-1',
          toolName: 'check',
          input: { count: 2 },
          approvalId: 'approval_call-1',
        },
      ])
      expect(result.needsClientExecution).toEqual([])
      expect(middlewareCalls).toBe(0)
      expect(result.executed).toEqual([])
    },
  )

  it.each([false, true])(
    'runs no middleware for a denied tool: client=%s',
    async (client) => {
      let middlewareCalls = 0
      const result = await runTool('{"count":2}', schema, {
        client,
        needsApproval: true,
        approvals: new Map([['call-1', false]]),
        middleware: {
          onBeforeToolCall: async () => {
            middlewareCalls++
          },
        },
      })
      expect(result.results[0]?.outcome).toBe('denied')
      expect(result.needsClientExecution).toEqual([])
      expect(middlewareCalls).toBe(0)
      expect(result.executed).toEqual([])
    },
  )
})

const clientCheck = (
  inputSchema: SchemaInput,
  needsApproval = false,
): Tool => ({
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

function clientInput(chunks: Array<StreamChunk>) {
  return descriptors(chunks).find((entry) => entry.id === 'client_tool_call')
    ?.metadata?.input
}

const review = defineInterrupt({
  id: 'boundary-review',
  responseSchema: z.boolean(),
})

// Pauses before the tools run, so client requests come from the boundary.
const reviewBeforeTools = defineChatMiddleware({
  name: 'boundary',
  onInterruptBoundary(ctx) {
    if (ctx.phase !== 'beforeTools') return undefined
    return {
      interrupts: [
        review.interrupt({
          key: 'review',
          reason: 'review',
          message: 'Review',
        }),
      ],
    }
  },
})

async function initial(
  input: unknown,
  tool: Tool,
  middleware: Array<ChatMiddleware> = [],
  boundary = false,
) {
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
  const messages: Array<ModelMessage> = [{ role: 'user', content: 'check' }]
  if (!boundary) {
    return collectChunks(chat({ adapter, messages, tools: [tool], middleware }))
  }
  return collectChunks(
    chat({
      adapter,
      messages,
      tools: [tool],
      interrupts: [review],
      middleware: [reviewBeforeTools, ...middleware],
    }),
  )
}

describe('client tool input in chat()', () => {
  it.each([false, true])(
    'shows middleware the raw input, then sends the checked input: boundary=%s',
    async (boundary) => {
      let transforms = 0
      const seen: Array<unknown> = []
      const inputSchema = z.object({
        count: z.string().transform((value) => {
          transforms++
          return Number(value)
        }),
      })
      const chunks = await initial(
        { count: '2' },
        clientCheck(inputSchema),
        [
          {
            onBeforeToolCall(_ctx, hook) {
              seen.push(structuredClone(hook.args))
            },
          },
        ],
        boundary,
      )
      expect(seen).toEqual([{ count: '2' }])
      expect(transforms).toBe(1)
      expect(clientInput(chunks)).toEqual({ count: 2 })
    },
  )

  it.each([false, true])(
    'sends no client request when middleware makes the input invalid: boundary=%s',
    async (boundary) => {
      const chunks = await initial(
        { count: 2 },
        clientCheck(schema),
        [
          {
            onBeforeToolCall: () => ({
              type: 'transformArgs',
              args: { count: 'wrong' },
            }),
          },
        ],
        boundary,
      )
      expect(clientInput(chunks)).toBeUndefined()
      expect(
        chunks.some(
          (chunk) =>
            chunk.type === EventType.TOOL_CALL_RESULT &&
            typeof chunk.content === 'string' &&
            chunk.content.includes('Input validation failed'),
        ),
      ).toBe(true)
    },
  )

  it('runs no middleware for the pending approval preview', async () => {
    let hooks = 0
    const chunks = await initial(
      { count: '2' },
      clientCheck(z.object({ count: z.string().transform(Number) }), true),
      [
        {
          onBeforeToolCall() {
            hooks++
          },
        },
      ],
    )
    expect(hooks).toBe(0)
    expect(
      descriptors(chunks).find((entry) => entry.id === 'approval_call')
        ?.metadata?.input,
    ).toEqual({ count: 2 })
    expect(clientInput(chunks)).toBeUndefined()
  })

  it('checks an approval edit after middleware on resume', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [] })
    const seen: Array<unknown> = []
    const inputSchema = z.object({
      count: z.number().transform((value) => value + 1),
    })
    const chunks = await collectChunks(
      chat({
        adapter,
        parentRunId: 'old',
        messages: history({ count: 1 }),
        tools: [clientCheck(inputSchema, true)],
        resume: [
          {
            interruptId: 'approval_call',
            status: 'resolved',
            payload: { approved: true, editedArgs: { count: 2 } },
          },
        ],
        middleware: [
          {
            onBeforeToolCall(_ctx, hook) {
              seen.push(structuredClone(hook.args))
            },
          },
        ],
      }),
    )
    expect(calls).toHaveLength(0)
    expect(seen).toEqual([{ count: 2 }])
    expect(clientInput(chunks)).toEqual({ count: 3 })
  })

  it('checks the client input, with no second hook run, when the result comes back', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished()]],
    })
    let hooks = 0
    await collectChunks(
      chat({
        adapter,
        parentRunId: 'old',
        messages: history({ count: 'wrong' }),
        tools: [clientCheck(schema)],
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
    expect(hooks).toBe(0)
    const results = calls[0]?.messages.filter(
      (message) => message.role === 'tool',
    )
    expect(results).toHaveLength(1)
    expect(JSON.stringify(results?.[0])).toContain('Input validation failed')
  })

  it('records no execute_tool span for a client tool', async () => {
    const fakeTracer = createFakeTracer()
    await initial({ count: 2 }, clientCheck(schema), [
      otelMiddleware({
        tracer: fakeTracer.tracer,
        meter: createFakeMeter().meter,
      }),
    ])
    expect(
      fakeTracer.spans.some((span) => span.name.startsWith('execute_tool')),
    ).toBe(false)
  })
})
