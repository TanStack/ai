import { describe, expect, it } from 'vitest'
import {
  EventType,
  canonicalInterruptJson,
  chat,
  defineChatMiddleware,
  digestInterruptJson,
} from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withChatPersistence } from '../src/middleware'
import { defineAIPersistence } from '../src/types'
import type { AnyTextAdapter, StreamChunk, Tool } from '@tanstack/ai'

// --- minimal mock text adapter ---------------------------------------------

function mockAdapter(iterations: Array<Array<StreamChunk>>) {
  const calls: Array<unknown> = []
  let i = 0
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {
        text: undefined,
        image: undefined,
        audio: undefined,
        video: undefined,
        document: undefined,
      },
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    chatStream: (opts) => {
      calls.push(opts)
      const chunks = iterations[i] ?? []
      i++
      return (async function* () {
        for (const c of chunks) yield c
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
  return { adapter, calls }
}

const ev = {
  runStarted: (runId = 'r1', threadId = 't1'): StreamChunk => ({
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: 1,
  }),
  text: (delta: string): StreamChunk => ({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm1',
    delta,
    timestamp: 1,
  }),
  runFinished: (runId = 'r1', threadId = 't1'): StreamChunk => ({
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    finishReason: 'stop',
    timestamp: 1,
  }),
  interrupted: (interruptId = 'interrupt-1'): StreamChunk => ({
    type: EventType.RUN_FINISHED,
    runId: 'r1',
    threadId: 't1',
    finishReason: 'tool_calls',
    timestamp: 1,
    outcome: {
      type: 'interrupt',
      interrupts: [
        {
          id: interruptId,
          reason: 'generic',
          responseSchema: {
            type: 'object',
            properties: { value: { type: 'number' } },
            required: ['value'],
            additionalProperties: false,
          },
          metadata: {
            'tanstack:interruptBinding': {
              kind: 'generic',
              interruptId,
              responseSchemaHash: digestInterruptJson(
                canonicalInterruptJson({
                  type: 'object',
                  properties: { value: { type: 'number' } },
                  required: ['value'],
                  additionalProperties: false,
                }),
              ),
            },
          },
        },
      ],
    },
  }),
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

async function expectCollectInterruptError(
  stream: AsyncIterable<StreamChunk>,
  pattern: RegExp,
) {
  expect(await collect(stream)).toEqual([
    expect.objectContaining({
      type: EventType.RUN_ERROR,
      message: expect.stringMatching(pattern),
      'tanstack:interruptErrors': expect.any(Array),
    }),
  ])
}

describe('withChatPersistence (state-only)', () => {
  it('completes the run and saves the transcript', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.runFinished()],
    ])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // The persistence middleware never stamps delivery cursors on the stream.
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.every((c) => !('cursor' in c))).toBe(true)

    // Run is completed and the transcript is saved.
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe('completed')
    expect(
      (await persistence.stores.messages!.loadThread('t1')).length,
    ).toBeGreaterThan(0)
  })

  it('records an interrupt and marks the run interrupted', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect((await persistence.stores.runs!.get('r1'))?.status).toBe(
      'interrupted',
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('emits only safe correlated bindings while persisting descriptors separately', async () => {
    const persistence = memoryPersistence()
    const approvalTool: Tool = {
      name: 'dangerousAction',
      description: 'Perform a dangerous action',
      needsApproval: true,
      inputSchema: {
        type: 'object',
        properties: { action: { type: 'string' } },
        required: ['action'],
        additionalProperties: false,
      },
      execute: ({ action }) => ({ action }),
    }
    const browserTool: Tool = {
      name: 'browserAction',
      description: 'Perform an action in the browser',
      outputSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
    }
    const addPrivateBindingFields = defineChatMiddleware({
      name: 'add-private-binding-fields',
      onChunk(_ctx, chunk) {
        if (
          chunk.type !== EventType.RUN_FINISHED ||
          chunk.outcome?.type !== 'interrupt'
        ) {
          return
        }
        return {
          ...chunk,
          outcome: {
            ...chunk.outcome,
            interrupts: chunk.outcome.interrupts.map((interrupt) => ({
              ...interrupt,
              metadata: {
                ...interrupt.metadata,
                'tanstack:interruptBinding': {
                  ...interrupt.metadata?.['tanstack:interruptBinding'],
                  authorizationToken: 'must-not-leak',
                  internal: { serverOnly: true },
                },
              },
            })),
          },
        }
      },
    })

    async function runInterrupt(input: {
      runId: string
      threadId: string
      toolCallId: string
      tool: Tool
      args: string
    }) {
      const { adapter } = mockAdapter([
        [
          ev.runStarted(input.runId, input.threadId),
          {
            type: EventType.TOOL_CALL_START,
            toolCallId: input.toolCallId,
            toolCallName: input.tool.name,
            toolName: input.tool.name,
            timestamp: 1,
          },
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: input.toolCallId,
            delta: input.args,
            timestamp: 1,
          },
          {
            type: EventType.RUN_FINISHED,
            runId: input.runId,
            threadId: input.threadId,
            finishReason: 'tool_calls',
            timestamp: 1,
          },
        ],
      ])
      const chunks = await collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'pause' }],
          runId: input.runId,
          threadId: input.threadId,
          tools: [input.tool],
          middleware: [
            withChatPersistence(persistence),
            addPrivateBindingFields,
          ],
        }) as AsyncIterable<StreamChunk>,
      )
      const terminal = chunks.find(
        (chunk) =>
          chunk.type === EventType.RUN_FINISHED &&
          chunk.outcome?.type === 'interrupt',
      )
      if (
        terminal?.type !== EventType.RUN_FINISHED ||
        terminal.outcome?.type !== 'interrupt'
      ) {
        throw new Error('Expected one public interrupt terminal.')
      }
      return terminal
    }

    const approvalTerminal = await runInterrupt({
      runId: 'approval-run',
      threadId: 'approval-thread',
      toolCallId: 'approval-call-1',
      tool: approvalTool,
      args: '{"action":"delete"}',
    })
    const browserTerminal = await runInterrupt({
      runId: 'client-run',
      threadId: 'client-thread',
      toolCallId: 'client-call-1',
      tool: browserTool,
      args: '{}',
    })
    expect(approvalTerminal).toMatchObject({
      outcome: {
        interrupts: [
          {
            id: 'approval_approval-call-1',
            reason: 'tool_call',
            toolCallId: 'approval-call-1',
          },
        ],
      },
    })
    expect(browserTerminal).toMatchObject({
      outcome: {
        interrupts: [
          {
            id: 'client_tool_client-call-1',
            reason: 'tanstack:client_tool_execution',
            toolCallId: 'client-call-1',
          },
        ],
      },
    })

    const stored = [
      ...(await persistence.stores.interrupts.listPendingByRun('approval-run')),
      ...(await persistence.stores.interrupts.listPendingByRun('client-run')),
    ]
    expect(stored).toHaveLength(2)
    for (const record of stored) {
      if (
        record.payload === null ||
        typeof record.payload !== 'object' ||
        Array.isArray(record.payload)
      ) {
        throw new Error('Expected a persisted interrupt descriptor.')
      }
      const payload: Record<string, unknown> = Object.fromEntries(
        Object.entries(record.payload),
      )
      expect(payload.metadata).not.toHaveProperty('tanstack:interruptBinding')
      expect(record.binding).toMatchObject({
        interruptId: record.interruptId,
        interruptedRunId: record.runId,
        generation: 1,
      })
      expect(record.binding).not.toHaveProperty('authorizationToken')
      expect(record.binding).not.toHaveProperty('internal')
    }

    const publicBindings = [approvalTerminal, browserTerminal].flatMap(
      (terminal) =>
        terminal.outcome?.type === 'interrupt'
          ? terminal.outcome.interrupts.map(
              (interrupt) => interrupt.metadata?.['tanstack:interruptBinding'],
            )
          : [],
    )
    expect(publicBindings).toEqual(stored.map((record) => record.binding))
    for (const binding of publicBindings) {
      expect(binding).not.toHaveProperty('authorizationToken')
      expect(binding).not.toHaveProperty('internal')
    }
  })

  it('blocks normal new input while a thread has pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const next = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    await expectCollectInterruptError(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
        stream: true,
      }),
      /parentRunId/i,
    )
    expect(next.calls.length).toBe(0)
  })

  it('requires resume entries to match all pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const next = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    await expectCollectInterruptError(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        parentRunId: 'r1',
        threadId: 't1',
        resume: [{ interruptId: 'other-interrupt', status: 'resolved' }],
        middleware: [withChatPersistence(persistence)],
        stream: true,
      }),
      /missing resume entry for interrupt interrupt-1/i,
    )
    expect(next.calls.length).toBe(0)
  })

  it('applies matching resume entries and then allows new input', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const next = mockAdapter([[ev.runStarted('r2', 't1'), ev.text('fresh')]])
    const chunks = await collect(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        parentRunId: 'r1',
        threadId: 't1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { value: 42 },
          },
        ],
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(next.calls.length).toBe(1)
    expect(
      chunks.some((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT),
    ).toBe(true)
    expect(
      (await persistence.stores.interrupts!.get('interrupt-1'))?.status,
    ).toBe('resolved')
  })

  it('persists messages without requiring a run store', async () => {
    const full = memoryPersistence()
    const persistence = defineAIPersistence({
      stores: { messages: full.stores.messages },
    })
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.runFinished()],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).not.toEqual([])
  })

  it('falls through to ephemeral native interrupts without an interrupt store', async () => {
    const full = memoryPersistence()
    const persistence = defineAIPersistence({
      stores: { messages: full.stores.messages },
    })
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call-client',
          toolCallName: 'clientSearch',
          toolName: 'clientSearch',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call-client',
          delta: '{"query":"test"}',
          timestamp: 1,
        },
        {
          ...ev.runFinished(),
          finishReason: 'tool_calls',
        },
      ],
    ])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'search' }],
        tools: [{ name: 'clientSearch', description: 'Search on the client' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withChatPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(chunks.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: {
        type: 'interrupt',
        interrupts: [
          {
            id: 'client_tool_call-client',
            metadata: {
              'tanstack:interruptBinding': {
                interruptedRunId: 'r1',
                generation: 0,
              },
            },
          },
        ],
      },
    })
    expect(await persistence.stores.messages!.loadThread('t1')).not.toEqual([])
  })

  it('is a no-op without the middleware: the stream is unchanged', async () => {
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('plain'), ev.runFinished()],
    ])
    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
      }) as AsyncIterable<StreamChunk>,
    )
    expect(chunks.every((c) => !('cursor' in c))).toBe(true)
  })
})
