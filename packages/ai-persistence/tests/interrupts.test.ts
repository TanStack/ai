import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  chat,
  defineChatMiddleware,
  defineInterrupt,
} from '@tanstack/ai'
import type {
  AdapterYieldChunk,
  AnyTextAdapter,
  ChatResumeToolState,
  StreamChunk,
  TokenUsage,
  Tool,
} from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'
import type { InterruptStore } from '../src/types'
import { threadMessages } from './persistence-fixtures'

function mockAdapter(iterations: Array<Array<AdapterYieldChunk>>) {
  const calls: Array<unknown> = []
  let i = 0
  const adapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: (opts: unknown) => {
      calls.push(opts)
      const chunks = iterations[i] ?? []
      i++
      return (async function* () {
        for (const c of chunks) yield c
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
  return { adapter, calls }
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

const coercedCountSchema = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate(value: unknown) {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !('count' in value) ||
        (typeof value.count !== 'string' && typeof value.count !== 'number')
      ) {
        return { issues: [{ message: 'count is required' }] }
      }
      const count = Number(value.count)
      return Number.isFinite(count)
        ? { value: { count } }
        : { issues: [{ message: 'count must be numeric' }] }
    },
    jsonSchema: {
      input() {
        return {
          type: 'object',
          required: ['count'],
          properties: { count: { type: 'string' } },
        }
      },
    },
  },
} as const

const transformedDisplaySchema = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate(value: unknown) {
      return typeof value === 'string'
        ? { value: value.length }
        : { issues: [{ message: 'display payload must be a string' }] }
    },
    jsonSchema: {
      input() {
        return { type: 'string' }
      },
    },
  },
} as const

function interruptErrorsOf(chunk: StreamChunk | undefined) {
  if (chunk?.type !== EventType.RUN_ERROR) return undefined
  return chunk.metadata?.tanstack?.interruptErrors
}

function expectResumeError(
  chunks: ReadonlyArray<StreamChunk>,
  interruptId: string,
) {
  const error = chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)
  expect(interruptErrorsOf(error)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ scope: 'item', interruptId }),
    ]),
  )
}

function isInterruptTerminal(chunk: StreamChunk): chunk is StreamChunk & {
  outcome: { type: 'interrupt'; interrupts: ReadonlyArray<{ id: string }> }
} {
  return (
    chunk.type === EventType.RUN_FINISHED &&
    'outcome' in chunk &&
    chunk.outcome?.type === 'interrupt'
  )
}

const interruptFinished = (
  runId = 'r1',
  usage?: TokenUsage,
): AdapterYieldChunk => ({
  type: EventType.RUN_FINISHED,
  runId,
  threadId: 't1',
  finishReason: 'tool_calls',
  timestamp: 1,
  ...(usage ? { usage } : {}),
  outcome: {
    type: 'interrupt',
    interrupts: [
      {
        id: 'interrupt-1',
        reason: 'tool_call',
        message: 'Approve the tool call?',
        toolCallId: 'tool-call-1',
      },
    ],
  },
})

const runStarted = (): AdapterYieldChunk => ({
  type: EventType.RUN_STARTED,
  runId: 'r1',
  threadId: 't1',
  timestamp: 1,
})

const toolStart = (parentMessageId?: string): AdapterYieldChunk => ({
  type: EventType.TOOL_CALL_START,
  toolCallId: 'tool-call-1',
  toolCallName: 'clientSearch',
  toolName: 'clientSearch',
  timestamp: 1,
  ...(parentMessageId ? { parentMessageId } : {}),
})

const toolArgs = (): AdapterYieldChunk => ({
  type: EventType.TOOL_CALL_ARGS,
  toolCallId: 'tool-call-1',
  delta: '{"query":"test"}',
  timestamp: 1,
})

const text = (delta: string): AdapterYieldChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

const runFinished = (runId = 'r1', usage?: TokenUsage): AdapterYieldChunk => ({
  type: EventType.RUN_FINISHED,
  runId,
  threadId: 't1',
  finishReason: 'stop',
  timestamp: 1,
  ...(usage ? { usage } : {}),
})

const toolCallFinished = (
  runId = 'r1',
  usage?: TokenUsage,
): AdapterYieldChunk => ({
  type: EventType.RUN_FINISHED,
  runId,
  threadId: 't1',
  finishReason: 'tool_calls',
  timestamp: 1,
  ...(usage ? { usage } : {}),
})

const toolCallChunks = (usage?: TokenUsage) => [
  runStarted(),
  toolStart(),
  toolArgs(),
  toolCallFinished('r1', usage),
]

async function persistClientToolTurn(
  persistence: ReturnType<typeof memoryPersistence>,
  tools: Array<Tool>,
  chunks: Array<StreamChunk> = toolCallChunks(),
) {
  const first = mockAdapter([chunks])
  await collect(
    chat({
      adapter: first.adapter,
      messages: [{ role: 'user', content: 'hi' }],
      tools,
      runId: 'r1',
      threadId: 't1',
      middleware: [withPersistence(persistence)],
    }) as AsyncIterable<StreamChunk>,
  )
  return first
}

const clientTool = (name: string): Tool => ({
  name,
  description: `${name} client tool`,
})

const approvalClientTool = (name: string): Tool => ({
  ...clientTool(name),
  needsApproval: true,
})

describe('interrupt persistence', () => {
  it('rechecks resolved approval schema identity in the later client-result phase', async () => {
    const persistence = memoryPersistence()
    const tool: Tool = {
      ...approvalClientTool('clientSearch'),
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
      },
    }
    await persistClientToolTurn(persistence, [tool])
    const phaseTwo = mockAdapter([])
    await collect(
      chat({
        adapter: phaseTwo.adapter,
        messages: [],
        tools: [tool],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'approval_tool-call-1',
            status: 'resolved',
            payload: true,
          },
        ],
        middleware: [withPersistence(persistence)],
      }),
    )
    const phaseThree = mockAdapter([[runStarted(), runFinished()]])
    let hooks = 0
    const changed: Tool = {
      ...tool,
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'number' } },
      },
    }
    const chunks = await collect(
      chat({
        adapter: phaseThree.adapter,
        messages: [],
        tools: [changed],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client_tool_tool-call-1',
            status: 'resolved',
            payload: { ok: true },
          },
        ],
        middleware: [
          withPersistence(persistence),
          {
            onBeforeToolCall() {
              hooks++
            },
          },
        ],
      }),
    )
    expect(hooks).toBe(0)
    expect(phaseThree.calls).toHaveLength(0)
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      true,
    )
    expect(
      (await persistence.stores.interrupts!.get('client_tool_tool-call-1'))
        ?.status,
    ).toBe('pending')
  })
  it.each(['coerce', 'repair', 'reject'])(
    'checks durable approved edits after middleware: %s',
    async (mode) => {
      let transforms = 0
      const schema = {
        '~standard': {
          version: 1 as const,
          vendor: 'durable-input',
          validate(value: unknown) {
            if (
              value &&
              typeof value === 'object' &&
              'query' in value &&
              typeof value.query === 'number'
            ) {
              transforms++
              return { value: { query: value.query + 1 } }
            }
            return { issues: [{ message: 'query must be a number' }] }
          },
          jsonSchema: {
            input: () => ({
              type: 'object',
              required: ['query'],
              properties: { query: { type: 'number' } },
            }),
          },
        },
      }
      const tool: Tool = {
        ...approvalClientTool('clientSearch'),
        inputSchema: schema,
      }
      const persistence = memoryPersistence()
      await persistClientToolTurn(
        persistence,
        [tool],
        [
          runStarted(),
          toolStart(),
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'tool-call-1',
            delta: '{"query":1}',
            timestamp: 1,
          },
          toolCallFinished(),
        ],
      )
      transforms = 0
      const continuation = mockAdapter([[runStarted(), runFinished()]])
      const seen: Array<string> = []
      const editedArgs = { query: mode === 'coerce' ? '2' : 'wrong' }
      const chunks = await collect(
        chat({
          adapter: continuation.adapter,
          messages: [],
          tools: [tool],
          runId: 'r1',
          threadId: 't1',
          resume: [
            {
              interruptId: 'approval_tool-call-1',
              status: 'resolved',
              payload: { approved: true, editedArgs },
            },
          ],
          middleware: [
            withPersistence(persistence),
            {
              onBeforeToolCall(_ctx, hook) {
                seen.push(JSON.stringify(hook.args))
                if (mode === 'repair')
                  return { type: 'transformArgs', args: { query: 3 } }
                return undefined
              },
            },
          ],
        }),
      )
      expect(seen).toEqual([JSON.stringify(editedArgs)])
      const descriptors = chunks.flatMap((chunk) =>
        chunk.type === EventType.RUN_FINISHED &&
        chunk.outcome?.type === 'interrupt'
          ? chunk.outcome.interrupts
          : [],
      )
      const execution = descriptors.find(
        (entry) => entry.id === 'client_tool_tool-call-1',
      )
      if (mode === 'reject') {
        expect(execution).toBeUndefined()
        expect(transforms).toBe(0)
        expect(
          chunks.some(
            (chunk) =>
              chunk.type === EventType.TOOL_CALL_RESULT &&
              typeof chunk.content === 'string' &&
              chunk.content.includes('query must be a number'),
          ),
        ).toBe(true)
      } else {
        expect(execution?.metadata?.input).toEqual({
          query: mode === 'coerce' ? 3 : 4,
        })
        expect(transforms).toBe(1)
        expect(continuation.calls).toHaveLength(0)
        const saved = threadMessages(
          await persistence.stores.messages!.loadThread('t1'),
        )
        const savedCall = saved
          .flatMap((message) => message.toolCalls ?? [])
          .find((call) => call.id === 'tool-call-1')
        expect(savedCall?.function.arguments).toBe(JSON.stringify(editedArgs))
        transforms = 0
        const phaseThree = mockAdapter([[runStarted(), runFinished()]])
        const phaseThreeSeen: Array<string> = []
        const finalChunks = await collect(
          chat({
            adapter: phaseThree.adapter,
            messages: [],
            tools: [tool],
            runId: 'r1',
            threadId: 't1',
            resume: [
              {
                interruptId: 'client_tool_tool-call-1',
                status: 'resolved',
                payload: { ok: true },
              },
            ],
            middleware: [
              withPersistence(persistence),
              {
                onBeforeToolCall(_ctx, hook) {
                  phaseThreeSeen.push(JSON.stringify(hook.args))
                  if (mode === 'repair')
                    return { type: 'transformArgs', args: { query: 3 } }
                  return undefined
                },
              },
            ],
          }),
        )
        expect(phaseThreeSeen).toEqual([JSON.stringify(editedArgs)])
        expect(transforms).toBe(1)
        expect(
          finalChunks.some(
            (chunk) =>
              chunk.type === EventType.RUN_FINISHED &&
              chunk.outcome?.type === 'interrupt',
          ),
        ).toBe(false)
        expect(phaseThree.calls).toHaveLength(1)
      }
    },
  )
  it('persists RUN_FINISHED interrupt outcomes as pending interrupt records', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[runStarted(), interruptFinished()]])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const pending = await persistence.stores.interrupts!.listPending('t1')
    expect(pending).toHaveLength(1)
    expect(pending[0]?.interruptId).toBe('interrupt-1')
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe(
      'interrupted',
    )
    // Persistence is state-only: it never stamps delivery cursors on the stream.
    expect(chunks.every((chunk) => !('cursor' in chunk))).toBe(true)
  })

  it('saves thread messages when a messages-enabled run pauses on an interrupt', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[runStarted(), interruptFinished()]])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hi' },
    ])
  })

  it('keeps the stream messageId on an interrupted tool-call turn', async () => {
    const persistence = memoryPersistence()
    await persistClientToolTurn(
      persistence,
      [approvalClientTool('clientSearch')],
      [
        runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'stream-assistant',
          role: 'assistant',
          timestamp: 1,
        },
        toolStart('stream-assistant'),
        toolArgs(),
        toolCallFinished(),
      ],
    )

    const thread = threadMessages(
      await persistence.stores.messages!.loadThread('t1'),
    )
    const toolTurn = thread.find(
      (message) =>
        message.role === 'assistant' &&
        message.toolCalls?.some((call) => call.id === 'tool-call-1'),
    )
    expect(toolTurn?.id).toBe('stream-assistant')
    expect(toolTurn?.createdAt).toBeInstanceOf(Date)
  })

  it('does not persist duplicate records before terminal interrupt outcome', async () => {
    const persistence = memoryPersistence()
    const create = vi.spyOn(persistence.stores.interrupts!, 'create')
    const { adapter } = mockAdapter([toolCallChunks()])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [approvalClientTool('clientSearch')],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(create).toHaveBeenCalledTimes(1)
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('persists client-tool interrupt usage once', async () => {
    const persistence = memoryPersistence()
    const usage = {
      promptTokens: 8,
      completionTokens: 3,
      totalTokens: 11,
    }

    await persistClientToolTurn(
      persistence,
      [approvalClientTool('clientSearch')],
      toolCallChunks(usage),
    )

    expect(await persistence.stores.runs!.get('r1')).toMatchObject({
      status: 'interrupted',
      usage,
    })
  })

  it('includes current usage from a direct interrupt after an earlier iteration', async () => {
    const persistence = memoryPersistence()
    const firstUsage = {
      promptTokens: 8,
      completionTokens: 3,
      totalTokens: 11,
    }
    const interruptUsage = {
      promptTokens: 13,
      completionTokens: 5,
      totalTokens: 18,
    }
    const { adapter } = mockAdapter([
      toolCallChunks(firstUsage),
      [runStarted(), interruptFinished('r1', interruptUsage)],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [
          {
            ...clientTool('clientSearch'),
            execute: () => ({ hits: [] }),
          },
        ],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.runs!.get('r1')).toMatchObject({
      status: 'interrupted',
      usage: {
        promptTokens: 21,
        completionTokens: 8,
        totalTokens: 29,
      },
    })
  })

  it('blocks normal new input while a thread has pending interrupts', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    const { adapter } = mockAdapter([[interruptFinished()]])

    expectResumeError(
      await collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'new input' }],
          runId: 'r2',
          threadId: 't1',
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
      'interrupt-1',
    )

    expect(await persistence.stores.runs!.get('r2')).toBeNull()
  })

  it('treats resume entries as interrupt continuation on the same run', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([
      [
        runStarted(),
        interruptFinished('r1', {
          promptTokens: 8,
          completionTokens: 3,
          totalTokens: 11,
        }),
      ],
    ])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )

    const continuation = mockAdapter([
      [
        runStarted(),
        text('continued'),
        runFinished('r1', {
          promptTokens: 16,
          completionTokens: 6,
          totalTokens: 22,
        }),
      ],
    ])
    const chunks = await collect(
      chat({
        adapter: continuation.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(continuation.calls).toHaveLength(1)
    expect(chunks).toContainEqual(
      expect.objectContaining({ delta: 'continued' }),
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
    expect(
      (await persistence.stores.interrupts!.get('interrupt-1'))?.status,
    ).toBe('resolved')
    expect((await persistence.stores.runs!.get('r1'))?.usage).toEqual({
      promptTokens: 24,
      completionTokens: 9,
      totalTokens: 33,
    })
  })

  // The full two-phase chain for an approval-required client tool, driven
  // entirely from persisted server state with empty client `messages`:
  //   phase 1: model requests the tool  -> approval interrupt pending
  //   phase 2: resume approves           -> client-execution interrupt pending
  //   phase 3: resume supplies output    -> tool result fed back, model finishes
  //
  // The engine reprocesses the pending tool call from the thread the middleware
  // rehydrates (not from the omitted client history), so approving does NOT
  // re-invoke the model — it advances straight to the client-execution
  // interrupt. Feeding the client output then drives exactly one model call.
  it('applies persisted approval and client-tool resume decisions with empty client messages', async () => {
    const persistence = memoryPersistence()
    await persistClientToolTurn(persistence, [
      approvalClientTool('clientSearch'),
    ])

    const approvalInterrupt = await persistence.stores.interrupts!.get(
      'approval_tool-call-1',
    )
    expect(approvalInterrupt?.status).toBe('pending')

    const afterApproval = mockAdapter([])
    const approvalChunks = await collect(
      chat({
        adapter: afterApproval.adapter,
        messages: [],
        tools: [approvalClientTool('clientSearch')],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'approval_tool-call-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // Approving a client tool does not call the model: the engine reprocesses
    // the rehydrated tool call and requests client execution directly.
    expect(afterApproval.calls).toHaveLength(0)
    expect(
      approvalChunks.find(
        (chunk) =>
          chunk.type === EventType.RUN_FINISHED &&
          chunk.outcome?.type === 'interrupt',
      ),
    ).toMatchObject({
      outcome: {
        interrupts: [
          {
            id: 'client_tool_tool-call-1',
            toolCallId: 'tool-call-1',
          },
        ],
      },
    })
    expect(
      (await persistence.stores.interrupts!.get('approval_tool-call-1'))
        ?.status,
    ).toBe('resolved')
    expect(
      (await persistence.stores.interrupts!.get('client_tool_tool-call-1'))
        ?.status,
    ).toBe('pending')

    const afterClientTool = mockAdapter([
      [runStarted(), text('done'), runFinished('r1')],
    ])
    const finalChunks = await collect(
      chat({
        adapter: afterClientTool.adapter,
        messages: [],
        tools: [approvalClientTool('clientSearch')],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client_tool_tool-call-1',
            status: 'resolved',
            payload: { answer: 42 },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // The client output is fed back as a tool result, then a single model call
    // produces the final answer.
    expect(afterClientTool.calls).toHaveLength(1)
    expect(finalChunks).toContainEqual(
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'tool-call-1',
        content: JSON.stringify({ answer: 42 }),
      }),
    )
    expect(finalChunks).toContainEqual(
      expect.objectContaining({ delta: 'done' }),
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
  })

  it('preserves failed client-tool resumes from persisted state', async () => {
    const persistence = memoryPersistence()
    await persistClientToolTurn(persistence, [clientTool('clientSearch')])

    const continuation = mockAdapter([
      [runStarted(), text('recovered'), runFinished('r1')],
    ])
    const chunks = await collect(
      chat({
        adapter: continuation.adapter,
        messages: [],
        tools: [clientTool('clientSearch')],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client_tool_tool-call-1',
            status: 'resolved',
            payload: { error: 'Client tool failed' },
            metadata: { tanstack: { state: 'output-error' } },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(continuation.calls).toHaveLength(1)
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'tool-call-1',
        content: JSON.stringify({ error: 'Client tool failed' }),
        metadata: { tanstack: { state: 'output-error' } },
      }),
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({ delta: 'recovered' }),
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
  })

  // Issue #1088: cancelling a hydrated client-tool interrupt under
  // withPersistence must complete the turn. Persistence clears `config.resume`
  // and must therefore put the cancelled toolCallId on `cancelledToolCallIds`.
  // Otherwise the engine treats the stored tool call as unhandled and emits
  // another `client_tool_*` interrupt instead of an output-error.
  it('completes a cancelled client-tool resume after its output schema changes', async () => {
    const persistence = memoryPersistence()
    await persistClientToolTurn(persistence, [clientTool('clientSearch')])

    const pending = await persistence.stores.interrupts!.get(
      'client_tool_tool-call-1',
    )
    expect(pending?.status).toBe('pending')

    const afterCancel = mockAdapter([
      [runStarted(), text('cancelled-and-done'), runFinished('r1')],
    ])
    const chunks = await collect(
      chat({
        adapter: afterCancel.adapter,
        messages: [],
        tools: [
          {
            ...clientTool('clientSearch'),
            outputSchema: transformedDisplaySchema,
          },
        ],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client_tool_tool-call-1',
            status: 'cancelled',
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(afterCancel.calls).toHaveLength(1)
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'tool-call-1',
        content: JSON.stringify({ error: 'Tool execution cancelled' }),
      }),
    )
    expect(
      chunks.find(
        (chunk) =>
          chunk.type === EventType.RUN_FINISHED &&
          chunk.outcome?.type === 'interrupt',
      ),
    ).toBeUndefined()
    expect(chunks).toContainEqual(
      expect.objectContaining({ delta: 'cancelled-and-done' }),
    )
    expect(
      (await persistence.stores.interrupts!.get('client_tool_tool-call-1'))
        ?.status,
    ).toBe('cancelled')
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
  })

  it('rejects invalid resume entries against pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[runStarted(), interruptFinished()]])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const continuation = mockAdapter([[text('SHOULD NOT RUN')]])
    expectResumeError(
      await collect(
        chat({
          adapter: continuation.adapter,
          messages: [],
          runId: 'r1',
          threadId: 't1',
          resume: [],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
      'interrupt-1',
    )

    expectResumeError(
      await collect(
        chat({
          adapter: continuation.adapter,
          messages: [],
          runId: 'r1',
          threadId: 't1',
          resume: [{ interruptId: 'stale-interrupt', status: 'resolved' }],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
      'interrupt-1',
    )

    expect(continuation.calls).toHaveLength(0)
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('rejects stale resume entries when a thread has no pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[runStarted(), text('done'), runFinished()]])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])

    const continuation = mockAdapter([[text('SHOULD NOT RUN')]])
    expectResumeError(
      await collect(
        chat({
          adapter: continuation.adapter,
          messages: [],
          runId: 'r1',
          threadId: 't1',
          resume: [{ interruptId: 'stale-interrupt', status: 'resolved' }],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
      'stale-interrupt',
    )

    expect(continuation.calls).toHaveLength(0)
  })

  it('accepts resume only when every pending interrupt has a valid matching entry', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    const bad = mockAdapter([[runStarted(), interruptFinished()]])

    expectResumeError(
      await collect(
        chat({
          adapter: bad.adapter,
          messages: [{ role: 'user', content: 'new input' }],
          runId: 'r2',
          threadId: 't1',
          resume: [{ interruptId: 'different', status: 'resolved' }],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
      'interrupt-1',
    )

    const good = mockAdapter([[runStarted(), interruptFinished('r2')]])
    await collect(
      chat({
        adapter: good.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        resume: [{ interruptId: 'interrupt-1', status: 'resolved' }],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(good.calls).toHaveLength(1)
  })

  it('rejects extra stale resume entries when pending interrupts are satisfied', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    const run = mockAdapter([[text('SHOULD NOT RUN')]])

    expectResumeError(
      await collect(
        chat({
          adapter: run.adapter,
          messages: [{ role: 'user', content: 'new input' }],
          runId: 'r2',
          threadId: 't1',
          resume: [
            { interruptId: 'interrupt-1', status: 'resolved' },
            { interruptId: 'stale-interrupt', status: 'resolved' },
          ],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
      'stale-interrupt',
    )

    expect(run.calls).toHaveLength(0)
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('applies valid resume entries and allows later normal input', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'resolve-me',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    await persistence.stores.interrupts!.create({
      interruptId: 'cancel-me',
      runId: 'old-run',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })

    const resumeRun = mockAdapter([
      [runStarted(), text('ok'), runFinished('r2')],
    ])
    await collect(
      chat({
        adapter: resumeRun.adapter,
        messages: [{ role: 'user', content: 'resume' }],
        runId: 'r2',
        threadId: 't1',
        resume: [
          {
            interruptId: 'resolve-me',
            status: 'resolved',
            payload: { approved: true },
          },
          { interruptId: 'cancel-me', status: 'cancelled' },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
    expect(
      (await persistence.stores.interrupts!.get('resolve-me'))?.status,
    ).toBe('resolved')
    expect(
      (await persistence.stores.interrupts!.get('resolve-me'))?.response,
    ).toEqual({ approved: true })
    expect(
      (await persistence.stores.interrupts!.get('cancel-me'))?.status,
    ).toBe('cancelled')

    const nextRun = mockAdapter([
      [runStarted(), text('next'), runFinished('r3')],
    ])
    await collect(
      chat({
        adapter: nextRun.adapter,
        messages: [{ role: 'user', content: 'next' }],
        runId: 'r3',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(nextRun.calls).toHaveLength(1)
  })

  it('marks terminal interrupt outcomes as interrupted', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[runStarted(), interruptFinished()]])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect((await persistence.stores.runs!.get('r1'))?.status).toBe(
      'interrupted',
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('keeps the interrupt pending when a resume run fails, and a retry succeeds', async () => {
    const persistence = memoryPersistence()

    // Run 1 pauses on an interrupt.
    const first = mockAdapter([[runStarted(), interruptFinished()]])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )

    // Run 2 (the resume) accepts the approval, then the provider fails
    // mid-stream (e.g. HTTP 500) before reaching any success boundary.
    const failing = {
      kind: 'text',
      name: 'mock',
      model: 'test-model',
      '~types': {},
      chatStream: () =>
        (async function* () {
          yield runStarted()
          throw new Error('provider 500')
        })(),
      structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    } as unknown as AnyTextAdapter

    await expect(
      collect(
        chat({
          adapter: failing,
          messages: [],
          runId: 'r1',
          threadId: 't1',
          resume: [
            {
              interruptId: 'interrupt-1',
              status: 'resolved',
              payload: { approved: true },
            },
          ],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('provider 500')

    // The approval was NOT consumed: the interrupt is pending again and the run
    // is marked failed.
    expect(
      (await persistence.stores.interrupts!.get('interrupt-1'))?.status,
    ).toBe('pending')
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe('failed')

    // Retrying with the same resume now succeeds and consumes the approval.
    const retry = mockAdapter([
      [runStarted(), text('continued'), runFinished('r1')],
    ])
    const chunks = await collect(
      chat({
        adapter: retry.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({ delta: 'continued' }),
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
    expect(
      (await persistence.stores.interrupts!.get('interrupt-1'))?.status,
    ).toBe('resolved')
  })

  it('fails closed: an approval resume without an `approved` flag denies the tool', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'approval-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { toolCallId: 'tc1', metadata: { kind: 'approval' } },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        // Malformed/truncated persisted payload: no `approved` field.
        resume: [
          { interruptId: 'approval-1', status: 'resolved', payload: {} },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const approvals = (
      run.calls[0] as { approvals?: ReadonlyMap<string, boolean> }
    ).approvals
    expect(approvals?.get('approval-1')).toBe(false)
  })

  it('honors an explicit approved:true resume payload', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'approval-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { toolCallId: 'tc1', metadata: { kind: 'approval' } },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'approval-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const approvals = (
      run.calls[0] as { approvals?: ReadonlyMap<string, boolean> }
    ).approvals
    expect(approvals?.get('approval-1')).toBe(true)
  })

  it('denies the tool when an approval is cancelled', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'approval-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { toolCallId: 'tc1', metadata: { kind: 'approval' } },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    const resumeStates: Array<ReadonlySet<string> | undefined> = []
    const observeResumeState = defineChatMiddleware({
      name: 'observe-resume-state',
      onConfig(_ctx, config) {
        resumeStates.push(config.resumeToolState?.cancelledToolCallIds)
      },
    })
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [{ interruptId: 'approval-1', status: 'cancelled' }],
        middleware: [withPersistence(persistence), observeResumeState],
      }) as AsyncIterable<StreamChunk>,
    )

    const approvals = (
      run.calls[0] as { approvals?: ReadonlyMap<string, boolean> }
    ).approvals
    expect(approvals?.get('approval-1')).toBe(false)
    expect(resumeStates[0]?.has('tc1')).toBe(true)
    expect(
      (await persistence.stores.interrupts!.get('approval-1'))?.status,
    ).toBe('cancelled')
  })

  it('drops the result of a cancelled client-tool interrupt', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'client-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { toolCallId: 'tc1', metadata: { kind: 'client_tool' } },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    const resumeStates: Array<ReadonlySet<string> | undefined> = []
    const observeResumeState = defineChatMiddleware({
      name: 'observe-resume-state',
      onConfig(_ctx, config) {
        resumeStates.push(config.resumeToolState?.cancelledToolCallIds)
      },
    })
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client-1',
            status: 'cancelled',
            payload: { answer: 99 },
          },
        ],
        middleware: [withPersistence(persistence), observeResumeState],
      }) as AsyncIterable<StreamChunk>,
    )

    // A cancelled client tool never surfaces its payload as a tool result: the
    // resume state carries no entry for the tool call.
    const clientToolResults = (
      run.calls[0] as { clientToolResults?: ReadonlyMap<string, unknown> }
    ).clientToolResults
    expect(clientToolResults?.get('tc1')).toBeUndefined()
    expect(resumeStates[0]?.has('tc1')).toBe(true)
    expect((await persistence.stores.interrupts!.get('client-1'))?.status).toBe(
      'cancelled',
    )
  })

  it('translates raw legacy client-tool resume payloads', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'client-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { toolCallId: 'tc1', metadata: { kind: 'client_tool' } },
    })

    const resumeStates: Array<ChatResumeToolState | undefined> = []
    await collect(
      chat({
        adapter: mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
          .adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client-1',
            status: 'resolved',
            payload: { answer: 42 },
          },
        ],
        middleware: [
          withPersistence(persistence),
          defineChatMiddleware({
            name: 'observe-resume-state',
            onConfig(_ctx, config) {
              resumeStates.push(config.resumeToolState)
            },
          }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(resumeStates[0]?.clientToolResults?.get('tc1')).toEqual({
      answer: 42,
    })
  })

  it('tolerates malformed persisted interrupt payloads without crashing', async () => {
    const persistence = memoryPersistence()
    // Payload with the wrong shapes for the defensive parsers: metadata is a
    // string (not an object), toolCallId is a number.
    await persistence.stores.interrupts!.create({
      interruptId: 'weird-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { metadata: 'not-an-object', toolCallId: 123 },
    })

    const run = mockAdapter([[runStarted(), text('ok'), runFinished('r1')]])
    await collect(
      chat({
        adapter: run.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [{ interruptId: 'weird-1', status: 'resolved', payload: {} }],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // The run is unaffected (no approval/client-tool detected) and the resume is
    // still committed on success.
    expect(run.calls).toHaveLength(1)
    expect(
      (run.calls[0] as { approvals?: ReadonlyMap<string, boolean> }).approvals
        ?.size ?? 0,
    ).toBe(0)
    expect((await persistence.stores.interrupts!.get('weird-1'))?.status).toBe(
      'resolved',
    )
  })

  it('restores a registered generic interrupt after reload and gives its transformed response to the resolution hook', async () => {
    const persistence = memoryPersistence()
    const review = defineInterrupt({
      id: 'persisted-review',
      payloadSchema: transformedDisplaySchema,
      responseSchema: coercedCountSchema,
    })
    const boundary = defineChatMiddleware({
      onInterruptBoundary(ctx) {
        if (ctx.phase !== 'afterModel') return
        return {
          interrupts: [
            review.interrupt({
              key: 'one',
              payload: 'Review this plan',
              reason: 'review',
              message: 'Review this plan',
            }),
          ],
        }
      },
    })
    const first = mockAdapter([[runStarted(), runFinished('r1')]])
    await collect(
      chat({
        adapter: first.adapter,
        interrupts: [review],
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [boundary, withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    const interruptId = (
      await persistence.stores.interrupts!.listPending('t1')
    )[0]?.interruptId
    expect(interruptId).toBeDefined()
    if (!interruptId) throw new Error('Expected a persisted generic interrupt')

    const observed: Array<unknown> = []
    const resumed = mockAdapter([
      [runStarted(), text('continued'), runFinished('r1')],
    ])
    await collect(
      chat({
        adapter: resumed.adapter,
        interrupts: [review],
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId,
            status: 'resolved',
            payload: { count: '2' },
          },
        ],
        middleware: [
          defineChatMiddleware({
            onInterruptResolution(_ctx, resolutions) {
              observed.push(...resolutions.for(review))
              return { toolResume: 'continue' }
            },
          }),
          withPersistence(persistence),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(observed).toEqual([
      expect.objectContaining({
        status: 'resolved',
        request: expect.objectContaining({
          payload: 'Review this plan'.length,
        }),
        response: { count: 2 },
      }),
    ])
    expect(
      (await persistence.stores.interrupts!.get(interruptId))?.status,
    ).toBe('resolved')
  })

  it('rejects a persisted generic interrupt whose definition hash drifted', async () => {
    const persistence = memoryPersistence()
    const review = defineInterrupt({
      id: 'persisted-review',
      payloadSchema: transformedDisplaySchema,
      responseSchema: coercedCountSchema,
    })
    const first = mockAdapter([[runStarted(), runFinished('r1')]])
    await collect(
      chat({
        adapter: first.adapter,
        interrupts: [review],
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          defineChatMiddleware({
            onInterruptBoundary(ctx) {
              if (ctx.phase !== 'afterModel') return
              return {
                interrupts: [
                  review.interrupt({
                    key: 'one',
                    payload: 'Review this plan',
                    reason: 'review',
                    message: 'Review this plan',
                  }),
                ],
              }
            },
          }),
          withPersistence(persistence),
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    const interruptId = (
      await persistence.stores.interrupts!.listPending('t1')
    )[0]?.interruptId
    expect(interruptId).toBeDefined()
    if (!interruptId) throw new Error('Expected a persisted generic interrupt')

    const driftedResponseSchema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate(value: unknown) {
          return value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            'approved' in value &&
            typeof value.approved === 'boolean'
            ? { value: { approved: value.approved } }
            : { issues: [{ message: 'approved is required' }] }
        },
        jsonSchema: {
          input() {
            return {
              type: 'object',
              required: ['approved'],
              properties: { approved: { type: 'boolean' } },
            }
          },
        },
      },
    } as const
    const drifted = defineInterrupt({
      id: 'persisted-review',
      payloadSchema: transformedDisplaySchema,
      responseSchema: driftedResponseSchema,
    })
    const resumed = mockAdapter([[runStarted(), text('SHOULD NOT RUN')]])
    const chunks = await collect(
      chat({
        adapter: resumed.adapter,
        interrupts: [drifted],
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId,
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(resumed.calls).toHaveLength(0)
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      true,
    )
    expect(
      (await persistence.stores.interrupts!.get(interruptId))?.status,
    ).toBe('pending')
  })

  it('resumes a registered generic record without blocking on a foreign persisted interrupt', async () => {
    const persistence = memoryPersistence()
    const review = defineInterrupt({
      id: 'mixed-persisted-review',
      responseSchema: coercedCountSchema,
    })
    const boundary = defineChatMiddleware({
      onInterruptBoundary(ctx) {
        if (ctx.phase !== 'afterModel') return
        return {
          interrupts: [
            review.interrupt({
              key: 'review',
              reason: 'review',
              message: 'Review this plan',
            }),
          ],
        }
      },
    })
    const legacyInterruptId = 'legacy-external'
    const initial = mockAdapter([
      [
        runStarted(),
        {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          finishReason: 'stop' as const,
          timestamp: 1,
          outcome: {
            type: 'interrupt',
            interrupts: [
              {
                id: legacyInterruptId,
                reason: 'legacy-review',
                message: 'A legacy system needs a response',
              },
            ],
          },
        } satisfies StreamChunk,
      ],
    ])

    await collect(
      chat({
        adapter: initial.adapter,
        interrupts: [review],
        messages: [{ role: 'user', content: 'Start' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [boundary, withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const pending = await persistence.stores.interrupts!.listPending('t1')
    expect(pending).toHaveLength(2)
    const registered = pending.find(
      (record) => record.interruptId !== legacyInterruptId,
    )!
    const legacy = pending.find(
      (record) => record.interruptId === legacyInterruptId,
    )!
    expect(registered.payload).toMatchObject({
      metadata: {
        'tanstack:interruptBinding': {
          definitionId: 'mixed-persisted-review',
          key: 'review',
        },
      },
    })
    expect(legacy.payload).toEqual({
      id: legacyInterruptId,
      reason: 'legacy-review',
      message: 'A legacy system needs a response',
    })

    const observed: Array<unknown> = []
    const resumed = mockAdapter([
      [runStarted(), text('complete'), runFinished('r1')],
    ])
    await collect(
      chat({
        adapter: resumed.adapter,
        interrupts: [review],
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: registered.interruptId,
            status: 'resolved',
            payload: { count: '3' },
          },
        ],
        middleware: [
          defineChatMiddleware({
            onInterruptResolution(_ctx, resolutions) {
              observed.push(...resolutions.for(review))
              return { toolResume: 'continue' }
            },
          }),
          withPersistence(persistence),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(observed).toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          definition: review,
          key: 'review',
        }),
        status: 'resolved',
        response: { count: 3 },
      }),
    ])
    expect(resumed.calls).toHaveLength(1)
    expect(
      (await persistence.stores.interrupts!.get(registered.interruptId))
        ?.status,
    ).toBe('resolved')
    expect(
      (await persistence.stores.interrupts!.get(legacyInterruptId))?.status,
    ).toBe('pending')
  })

  it('restores two requests with the same definition and key by their unique instance ids', async () => {
    const persistence = memoryPersistence()
    const review = defineInterrupt({
      id: 'repeat-review',
      responseSchema: coercedCountSchema,
    })
    const firstChunks = await collect(
      chat({
        adapter: mockAdapter([[runStarted(), runFinished('r1')]]).adapter,
        interrupts: [review],
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          defineChatMiddleware({
            onInterruptBoundary(ctx) {
              if (ctx.phase !== 'afterModel') return
              return {
                interrupts: [
                  review.interrupt({
                    key: 'same',
                    reason: 'review',
                    message: 'First',
                  }),
                  review.interrupt({
                    key: 'same',
                    reason: 'review',
                    message: 'Second',
                  }),
                ],
              }
            },
          }),
          withPersistence(persistence),
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    const terminal = firstChunks.find(isInterruptTerminal)
    const ids =
      terminal?.outcome.interrupts.map((interrupt) => interrupt.id) ?? []
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)

    const observed: Array<unknown> = []
    await collect(
      chat({
        adapter: mockAdapter([
          [runStarted(), text('continued'), runFinished('r1')],
        ]).adapter,
        interrupts: [review],
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: ids.map((interruptId, index) => ({
          interruptId,
          status: 'resolved' as const,
          payload: { count: String(index + 1) },
        })),
        middleware: [
          defineChatMiddleware({
            onInterruptResolution(_ctx, resolutions) {
              observed.push(...resolutions.for(review))
              return { toolResume: 'continue' }
            },
          }),
          withPersistence(persistence),
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(observed).toHaveLength(2)
    expect(await persistence.stores.interrupts!.listPending('t1')).toEqual([])
  })

  it('returns a structured conflict error for duplicate durable resume entries', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'duplicate-me',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    const { adapter } = mockAdapter([[text('SHOULD NOT RUN')]])

    const chunks = await collect(
      chat({
        adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          { interruptId: 'duplicate-me', status: 'resolved' },
          { interruptId: 'duplicate-me', status: 'cancelled' },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const error = chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)
    expect(interruptErrorsOf(error)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'item',
          interruptId: 'duplicate-me',
          code: 'conflict',
        }),
      ]),
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('rejects pending interrupts from more than one run on the same thread', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.interrupts!.create({
      interruptId: 'from-run-1',
      runId: 'run-1',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    await persistence.stores.interrupts!.create({
      interruptId: 'from-run-2',
      runId: 'run-2',
      threadId: 't1',
      requestedAt: 2,
      payload: {},
    })

    const chunks = await collect(
      chat({
        adapter: mockAdapter([[text('SHOULD NOT RUN')]]).adapter,
        messages: [],
        runId: 'run-3',
        threadId: 't1',
        resume: [
          { interruptId: 'from-run-1', status: 'resolved' },
          { interruptId: 'from-run-2', status: 'cancelled' },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const error = chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)
    expect(interruptErrorsOf(error)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'batch',
          code: 'stale',
          message: 'Thread has pending interrupts from more than one run.',
        }),
      ]),
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      2,
    )
  })

  it('keeps an opaque approval when a generic interrupt is also resumed', async () => {
    const persistence = memoryPersistence()
    const review = defineInterrupt({
      id: 'merge-review',
      responseSchema: coercedCountSchema,
    })
    const first = await collect(
      chat({
        adapter: mockAdapter([[runStarted(), runFinished('r1')]]).adapter,
        interrupts: [review],
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          defineChatMiddleware({
            onInterruptBoundary(ctx) {
              if (ctx.phase !== 'afterModel') return
              return {
                interrupts: [
                  review.interrupt({
                    key: 'review',
                    reason: 'review',
                    message: 'Review this plan',
                  }),
                ],
              }
            },
          }),
          withPersistence(persistence),
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    const terminal = first.find(isInterruptTerminal)
    const genericId = terminal?.outcome.interrupts[0]?.id
    if (!genericId) throw new Error('Expected a persisted generic interrupt')

    await persistence.stores.interrupts!.create({
      interruptId: 'approval-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 2,
      payload: { toolCallId: 'tc1', metadata: { kind: 'approval' } },
    })

    const resumeStates: Array<ChatResumeToolState | undefined> = []
    await collect(
      chat({
        adapter: mockAdapter([
          [runStarted(), text('continued'), runFinished('r1')],
        ]).adapter,
        interrupts: [review],
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'approval-1',
            status: 'resolved',
            payload: { approved: true },
          },
          {
            interruptId: genericId,
            status: 'resolved',
            payload: { count: '2' },
          },
        ],
        middleware: [
          withPersistence(persistence),
          defineChatMiddleware({
            name: 'observe-merged-resume-state',
            onConfig(_ctx, config) {
              resumeStates.push(config.resumeToolState)
            },
            onInterruptResolution() {
              return { toolResume: 'continue' }
            },
          }),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(resumeStates[0]?.approvals?.get('approval-1')).toBe(true)
    expect(resumeStates[0]?.genericInterruptRequests?.has(genericId)).toBe(true)
  })

  it('commits a mixed resume batch once when the store supports commitBatch', async () => {
    const persistence = memoryPersistence()
    const store = persistence.stores.interrupts!
    const defaultCommitBatch = store.commitBatch!.bind(store)
    const resolve = vi.spyOn(store, 'resolve')
    const cancel = vi.spyOn(store, 'cancel')
    const commitBatch = vi.fn(defaultCommitBatch)
    store.commitBatch = commitBatch

    await store.create({
      interruptId: 'resolved-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    await store.create({
      interruptId: 'cancelled-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 2,
      payload: {},
    })

    const { adapter } = mockAdapter([[runStarted(), text('ok'), runFinished()]])
    await collect(
      chat({
        adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'resolved-1',
            status: 'resolved',
            payload: { answer: 'yes' },
          },
          { interruptId: 'cancelled-1', status: 'cancelled' },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(commitBatch).toHaveBeenCalledTimes(1)
    expect(commitBatch).toHaveBeenCalledWith([
      {
        interruptId: 'resolved-1',
        status: 'resolved',
        response: { answer: 'yes' },
      },
      { interruptId: 'cancelled-1', status: 'cancelled' },
    ])
    expect(resolve).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
    expect((await store.get('resolved-1'))?.status).toBe('resolved')
    expect((await store.get('cancelled-1'))?.status).toBe('cancelled')
  })

  it('uses legacy writes when an old interrupt store has no commitBatch method', async () => {
    const persistence = memoryPersistence()
    const base = persistence.stores.interrupts!
    const resolve = vi.fn((interruptId: string, response?: unknown) =>
      base.resolve(interruptId, response),
    )
    const cancel = vi.fn((interruptId: string) => base.cancel(interruptId))
    const legacyStore: InterruptStore = {
      create: (record) => base.create(record),
      resolve,
      cancel,
      get: (interruptId) => base.get(interruptId),
      list: (threadId) => base.list(threadId),
      listPending: (threadId) => base.listPending(threadId),
      listByRun: (runId) => base.listByRun(runId),
      listPendingByRun: (runId) => base.listPendingByRun(runId),
    }
    persistence.stores.interrupts = legacyStore

    await legacyStore.create({
      interruptId: 'resolved-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    await legacyStore.create({
      interruptId: 'cancelled-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 2,
      payload: {},
    })

    const { adapter } = mockAdapter([[runStarted(), text('ok'), runFinished()]])
    await collect(
      chat({
        adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          { interruptId: 'resolved-1', status: 'resolved', payload: 'yes' },
          { interruptId: 'cancelled-1', status: 'cancelled' },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(resolve).toHaveBeenCalledWith('resolved-1', 'yes')
    expect(cancel).toHaveBeenCalledWith('cancelled-1')
  })

  it('preflights a memory interrupt batch before it changes any record', async () => {
    const persistence = memoryPersistence()
    const store = persistence.stores.interrupts!
    await store.create({
      interruptId: 'pending-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    await store.create({
      interruptId: 'pending-2',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 2,
      payload: {},
    })
    await store.create({
      interruptId: 'terminal-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 3,
      payload: {},
    })
    await store.resolve('terminal-1', { done: true })

    await expect(
      store.commitBatch!([
        { interruptId: 'pending-1', status: 'resolved', response: 'yes' },
        { interruptId: 'missing-1', status: 'cancelled' },
      ]),
    ).rejects.toThrow('missing id: missing-1')
    expect((await store.get('pending-1'))?.status).toBe('pending')

    await expect(
      store.commitBatch!([
        { interruptId: 'pending-1', status: 'resolved', response: 'yes' },
        { interruptId: 'pending-1', status: 'cancelled' },
      ]),
    ).rejects.toThrow('duplicate id: pending-1')
    expect((await store.get('pending-1'))?.status).toBe('pending')

    await expect(
      store.commitBatch!([
        { interruptId: 'pending-2', status: 'resolved', response: 'yes' },
        { interruptId: 'terminal-1', status: 'cancelled' },
      ]),
    ).rejects.toThrow('non-pending id: terminal-1')
    expect((await store.get('pending-2'))?.status).toBe('pending')
    expect((await store.get('terminal-1'))?.status).toBe('resolved')
  })

  it('keeps a mixed resume batch retryable when commitBatch rejects', async () => {
    const persistence = memoryPersistence()
    const store = persistence.stores.interrupts!
    const defaultCommitBatch = store.commitBatch!.bind(store)
    const resolve = vi.spyOn(store, 'resolve')
    const cancel = vi.spyOn(store, 'cancel')
    const commitBatch = vi.fn(async () => {
      throw new Error('batch write failed')
    })
    store.commitBatch = commitBatch
    await store.create({
      interruptId: 'resolved-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: {},
    })
    await store.create({
      interruptId: 'cancelled-1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 2,
      payload: {},
    })

    const { adapter } = mockAdapter([[runStarted(), text('ok'), runFinished()]])
    await expect(
      collect(
        chat({
          adapter,
          messages: [],
          runId: 'r1',
          threadId: 't1',
          resume: [
            { interruptId: 'resolved-1', status: 'resolved', payload: 'yes' },
            { interruptId: 'cancelled-1', status: 'cancelled' },
          ],
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('batch write failed')
    expect(await store.listPending('t1')).toHaveLength(2)
    expect((await store.get('resolved-1'))?.status).toBe('pending')
    expect((await store.get('cancelled-1'))?.status).toBe('pending')
    expect(resolve).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe('failed')

    store.commitBatch = vi.fn(defaultCommitBatch)
    const retry = mockAdapter([[runStarted(), text('retried'), runFinished()]])
    const chunks = await collect(
      chat({
        adapter: retry.adapter,
        messages: [],
        runId: 'r1',
        threadId: 't1',
        resume: [
          { interruptId: 'resolved-1', status: 'resolved', payload: 'yes' },
          { interruptId: 'cancelled-1', status: 'cancelled' },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(chunks).toContainEqual(expect.objectContaining({ delta: 'retried' }))
    expect(await store.listPending('t1')).toEqual([])
    expect((await store.get('resolved-1'))?.status).toBe('resolved')
    expect((await store.get('cancelled-1'))?.status).toBe('cancelled')
  })
})

describe('portable raw arguments across durable client phases', () => {
  it('retains lexical JSON through approval and client-result reload', async () => {
    const raw =
      '{"query":"test","overflow":1e999,"integer":9007199254740993,"zero":-0}'
    const persistence = memoryPersistence()
    const tool = approvalClientTool('clientSearch')
    const first = mockAdapter([
      [
        runStarted(),
        toolStart(),
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'tool-call-1',
          delta: raw,
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: 'tool-call-1',
          input: JSON.parse(raw),
          timestamp: 1,
        },
        toolCallFinished(),
      ],
    ])
    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'Check' }],
        tools: [tool],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }),
    )
    const savedArguments = async () => {
      const copied = JSON.parse(
        JSON.stringify(
          threadMessages(await persistence.stores.messages!.loadThread('t1')),
        ),
      )
      return copied
        .flatMap(
          (message: {
            toolCalls?: Array<{ id: string; function: { arguments: string } }>
          }) => message.toolCalls ?? [],
        )
        .find((call: { id: string }) => call.id === 'tool-call-1')?.function
        .arguments
    }
    expect(await savedArguments()).toBe(raw)
    const approved = mockAdapter([])
    await collect(
      chat({
        adapter: approved.adapter,
        messages: [],
        tools: [tool],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'approval_tool-call-1',
            status: 'resolved',
            payload: true,
          },
        ],
        middleware: [withPersistence(persistence)],
      }),
    )
    expect(await savedArguments()).toBe(raw)
    const resumed = mockAdapter([[runStarted(), runFinished()]])
    await collect(
      chat({
        adapter: resumed.adapter,
        messages: [],
        tools: [tool],
        runId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client_tool_tool-call-1',
            status: 'resolved',
            payload: { ok: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }),
    )
    expect(await savedArguments()).toBe(raw)
    expect(resumed.calls).toHaveLength(1)
  })
})

describe('server approval context across separate client phases', () => {
  async function clientPhase(clientRun = 'client-run') {
    const persistence = memoryPersistence()
    const tool = approvalClientTool('clientSearch')
    await collect(
      chat({
        adapter: mockAdapter([
          [runStarted(), toolStart(), toolArgs(), toolCallFinished()],
        ]).adapter,
        messages: [{ role: 'user', content: 'Check' }],
        tools: [tool],
        runId: 'approval-run',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }),
    )
    const original = JSON.parse(
      JSON.stringify(
        await persistence.stores.interrupts!.get('approval_tool-call-1'),
      ),
    )
    await collect(
      chat({
        adapter: mockAdapter([]).adapter,
        messages: [],
        tools: [tool],
        runId: clientRun,
        threadId: 't1',
        resume: [
          {
            interruptId: 'approval_tool-call-1',
            status: 'resolved',
            payload: true,
          },
        ],
        middleware: [withPersistence(persistence)],
      }),
    )
    return { persistence, tool, original }
  }

  it('copies the server approval reference before committing the previous phase', async () => {
    const { persistence, tool, original } = await clientPhase()
    const store = persistence.stores.interrupts!
    const client = await store.get('client_tool_tool-call-1')
    expect(client?.payload).toMatchObject({
      metadata: {
        'tanstack:approvalContext': {
          v: 1,
          approvalInterruptId: 'approval_tool-call-1',
          approvalRunId: 'approval-run',
          toolCallId: 'tool-call-1',
          toolName: 'clientSearch',
          generation: 0,
        },
      },
    })
    expect((await store.get('approval_tool-call-1'))?.payload).toEqual(
      original.payload,
    )
    const resumed = mockAdapter([[runStarted(), text('Done'), runFinished()]])
    const chunks = await collect(
      chat({
        adapter: resumed.adapter,
        messages: [],
        tools: [tool],
        runId: 'output-run',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client_tool_tool-call-1',
            status: 'resolved',
            payload: { ok: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }),
    )
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(resumed.calls).toHaveLength(1)
    expect(await store.listPending('t1')).toEqual([])
  })

  it.each([
    'absent',
    'null',
    'array',
    'version',
    'extra',
    'id',
    'run',
    'generation',
    'toolCallId',
    'toolName',
    'inputSchemaHash',
    'approvalSchemaHash',
    'responseSchemaHash',
    'pending',
    'cancelled',
    'denied',
    'missing',
    'thread',
    'descriptor',
    'bindingRun',
    'bindingId',
  ])(
    'rejects %s association without consuming the client phase',
    async (kind) => {
      const { persistence, tool } = await clientPhase()
      const store = persistence.stores.interrupts!
      const get = store.get.bind(store)
      const read = vi.spyOn(store, 'get').mockImplementation(async (id) => {
        const record = await get(id)
        if (!record) return record
        if (id === 'client_tool_tool-call-1') {
          const payload = JSON.parse(JSON.stringify(record.payload))
          const metadata = payload.metadata
          const context = metadata['tanstack:approvalContext']
          if (kind === 'absent') delete metadata['tanstack:approvalContext']
          else if (kind === 'null') metadata['tanstack:approvalContext'] = null
          else if (kind === 'array') metadata['tanstack:approvalContext'] = []
          else if (kind === 'version') context.v = 2
          else if (kind === 'extra') context.extra = true
          else if (kind === 'id') context.approvalInterruptId = 'missing'
          else if (kind === 'run') context.approvalRunId = 'wrong'
          else if (kind === 'generation') context.generation = 1
          else if (
            [
              'toolCallId',
              'toolName',
              'inputSchemaHash',
              'approvalSchemaHash',
              'responseSchemaHash',
            ].includes(kind)
          )
            context[kind] = 'wrong'
          return { ...record, payload }
        }
        if (id !== 'approval_tool-call-1') return record
        if (kind === 'missing') return null
        if (kind === 'pending') return { ...record, status: 'pending' }
        if (kind === 'cancelled') return { ...record, status: 'cancelled' }
        if (kind === 'denied') return { ...record, response: false }
        if (kind === 'thread') return { ...record, threadId: 'other-thread' }
        const payload = JSON.parse(JSON.stringify(record.payload))
        if (kind === 'descriptor') payload.id = 'wrong'
        if (kind === 'bindingRun')
          payload.metadata['tanstack:interruptBinding'].interruptedRunId =
            'wrong'
        if (kind === 'bindingId')
          payload.metadata['tanstack:interruptBinding'].interruptId = 'wrong'
        return { ...record, payload }
      })
      // Pending descriptors are loaded through listPending, not get.
      const list = store.listPending.bind(store)
      const pendingRead = vi
        .spyOn(store, 'listPending')
        .mockImplementation(async (thread) => {
          const records = await list(thread)
          return Promise.all(
            records.map(
              async (record) => (await store.get(record.interruptId)) ?? record,
            ),
          )
        })
      const resumed = mockAdapter([
        [runStarted(), text('Must not run'), runFinished()],
      ])
      let hooks = 0
      const chunks = await collect(
        chat({
          adapter: resumed.adapter,
          messages: [],
          tools: [tool],
          runId: 'output-run',
          threadId: 't1',
          resume: [
            {
              interruptId: 'client_tool_tool-call-1',
              status: 'resolved',
              payload: { ok: true },
            },
          ],
          middleware: [
            withPersistence(persistence),
            {
              onBeforeToolCall() {
                hooks++
              },
            },
          ],
        }),
      )
      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        true,
      )
      expect(hooks).toBe(0)
      expect(resumed.calls).toHaveLength(0)
      expect((await get('client_tool_tool-call-1'))?.status).toBe('pending')
      pendingRead.mockRestore()
      read.mockRestore()
      const retry = mockAdapter([
        [runStarted(), text('Retried'), runFinished()],
      ])
      const valid = await collect(
        chat({
          adapter: retry.adapter,
          messages: [],
          tools: [tool],
          runId: 'retry-run',
          threadId: 't1',
          resume: [
            {
              interruptId: 'client_tool_tool-call-1',
              status: 'resolved',
              payload: { ok: true },
            },
          ],
          middleware: [withPersistence(persistence)],
        }),
      )
      expect(valid.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        false,
      )
      expect(retry.calls).toHaveLength(1)
    },
  )

  it.each([false, true])(
    'rejects a malformed present context in same-run mode: %s',
    async (malformed) => {
      const { persistence, tool } = await clientPhase('approval-run')
      const store = persistence.stores.interrupts!
      const list = store.listPending.bind(store)
      const read = vi
        .spyOn(store, 'listPending')
        .mockImplementation(async (thread) =>
          (await list(thread)).map((record) => {
            const payload = JSON.parse(JSON.stringify(record.payload))
            if (malformed)
              payload.metadata['tanstack:approvalContext'] = { v: 2 }
            else delete payload.metadata['tanstack:approvalContext']
            return { ...record, payload }
          }),
        )
      const adapter = mockAdapter([[runStarted(), text('Done'), runFinished()]])
      const chunks = await collect(
        chat({
          adapter: adapter.adapter,
          messages: [],
          tools: [tool],
          runId: 'approval-run',
          threadId: 't1',
          resume: [
            {
              interruptId: 'client_tool_tool-call-1',
              status: 'resolved',
              payload: { ok: true },
            },
          ],
          middleware: [withPersistence(persistence)],
        }),
      )
      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        malformed,
      )
      expect(adapter.calls).toHaveLength(malformed ? 0 : 1)
      read.mockRestore()
    },
  )

  it('preserves the approval context through a JSON-copy store reload', async () => {
    const { persistence, tool } = await clientPhase()
    const restored = memoryPersistence()
    for (const record of await persistence.stores.interrupts!.list('t1')) {
      const copy = JSON.parse(JSON.stringify(record))
      await restored.stores.interrupts!.create({
        interruptId: copy.interruptId,
        runId: copy.runId,
        threadId: copy.threadId,
        requestedAt: copy.requestedAt,
        payload: copy.payload,
      })
      if (copy.status === 'resolved')
        await restored.stores.interrupts!.resolve(
          copy.interruptId,
          copy.response,
        )
    }
    await restored.stores.messages!.saveThread(
      't1',
      JSON.parse(
        JSON.stringify(
          threadMessages(await persistence.stores.messages!.loadThread('t1')),
        ),
      ),
    )
    const adapter = mockAdapter([
      [runStarted(), text('Reloaded'), runFinished()],
    ])
    const chunks = await collect(
      chat({
        adapter: adapter.adapter,
        messages: [],
        tools: [tool],
        runId: 'reload-run',
        threadId: 't1',
        resume: [
          {
            interruptId: 'client_tool_tool-call-1',
            status: 'resolved',
            payload: { ok: true },
          },
        ],
        middleware: [withPersistence(restored)],
      }),
    )
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(adapter.calls).toHaveLength(1)
    expect(await restored.stores.interrupts!.listPending('t1')).toEqual([])
    expect(
      (await persistence.stores.interrupts!.get('client_tool_tool-call-1'))
        ?.status,
    ).toBe('pending')
  })

  it.each(['commit', 'create'])(
    'does not revive a consumed approval after a %s write failure',
    async (failure) => {
      const persistence = memoryPersistence()
      const store = persistence.stores.interrupts!
      const tool = approvalClientTool('clientSearch')
      await persistClientToolTurn(persistence, [tool])
      const before = JSON.parse(
        JSON.stringify((await store.get('approval_tool-call-1'))?.payload),
      )
      const commit = vi.spyOn(store, 'commitBatch')
      const create = vi.spyOn(store, 'create')
      if (failure === 'commit')
        commit.mockRejectedValueOnce(new Error('approval commit failed'))
      else
        create.mockRejectedValueOnce(
          new Error('client checkpoint create failed'),
        )
      const failed = await collect(
        chat({
          adapter: mockAdapter([]).adapter,
          messages: [],
          tools: [tool],
          runId: 'next-run',
          threadId: 't1',
          resume: [
            {
              interruptId: 'approval_tool-call-1',
              status: 'resolved',
              payload: true,
            },
          ],
          middleware: [withPersistence(persistence)],
        }),
      )
      expect(failed).toContainEqual(
        expect.objectContaining({
          type: EventType.RUN_ERROR,
          message:
            failure === 'commit'
              ? 'approval commit failed'
              : 'client checkpoint create failed',
        }),
      )
      const approval = await store.get('approval_tool-call-1')
      expect(approval?.status).toBe(
        failure === 'commit' ? 'pending' : 'resolved',
      )
      expect(approval?.payload).toEqual(before)
      expect(await store.get('client_tool_tool-call-1')).toBeNull()
      commit.mockRestore()
      create.mockRestore()
      if (failure === 'commit') {
        await collect(
          chat({
            adapter: mockAdapter([]).adapter,
            messages: [],
            tools: [tool],
            runId: 'retry-client-run',
            threadId: 't1',
            resume: [
              {
                interruptId: 'approval_tool-call-1',
                status: 'resolved',
                payload: true,
              },
            ],
            middleware: [withPersistence(persistence)],
          }),
        )
        expect(
          (await store.get('client_tool_tool-call-1'))?.payload,
        ).toMatchObject({
          metadata: { 'tanstack:approvalContext': { approvalRunId: 'r1' } },
        })
      } else expect(await store.listPending('t1')).toEqual([])
    },
  )
})
