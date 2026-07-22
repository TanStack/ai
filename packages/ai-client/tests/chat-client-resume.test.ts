import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  convertSchemaToJsonSchema,
  digestInterruptJson,
  canonicalInterruptJson,
  hashSchemaInput,
  toolDefinition,
} from '@tanstack/ai/client'
import { z } from 'zod'
import { ChatClient } from '../src/chat-client'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type {
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai/client'
import type { UIMessage } from '../src/types'

/**
 * Adapter that records each connect's runContext and yields scripted chunks.
 * A script can be a function of the live `runContext` (so a test can emit a
 * RUN_FINISHED carrying the same runId the client generated and passed in).
 */
interface ThrowingScript {
  chunks: Array<StreamChunk>
  error: Error
}

type ScriptResult = Array<StreamChunk> | ThrowingScript
type Script =
  | ScriptResult
  | ((ctx: RunAgentInputContext | undefined) => ScriptResult)

function recordingAdapter(scripts: Array<Script>) {
  const contexts: Array<RunAgentInputContext | undefined> = []
  const sentMessages: Array<Array<ModelMessage> | Array<UIMessage>> = []
  let i = 0
  const adapter: ConnectConnectionAdapter = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *connect(messages, _data, _signal, runContext) {
      sentMessages.push(messages)
      contexts.push(runContext)
      const script = scripts[i]
      i++
      const result =
        typeof script === 'function' ? script(runContext) : (script ?? [])
      const chunks = Array.isArray(result) ? result : result.chunks
      for (const c of chunks) yield c
      if (!Array.isArray(result)) throw result.error
    },
  }
  return { adapter, contexts, sentMessages }
}

async function createInterruptedClient(continuation: Script) {
  const { adapter } = recordingAdapter([
    (ctx) => [
      {
        type: EventType.RUN_STARTED,
        runId: ctx?.runId ?? 'interrupted-run',
        threadId: ctx?.threadId ?? 'thread-1',
        timestamp: Date.now(),
      },
      {
        type: EventType.RUN_FINISHED,
        runId: ctx?.runId ?? 'interrupted-run',
        threadId: ctx?.threadId ?? 'thread-1',
        timestamp: Date.now(),
        outcome: {
          type: 'interrupt',
          interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
        },
      },
    ],
    continuation,
  ])
  const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })
  await client.sendMessage('hi')
  return client
}

function resolveGenericInterrupt(client: ChatClient): void {
  const interrupt = client.getInterrupts()[0]
  if (interrupt?.kind !== 'generic') {
    throw new Error('Expected a generic interrupt')
  }
  interrupt.resolveInterrupt({ answer: 'continue' })
}

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  timestamp: Date.now(),
  delta,
})
const runStarted: StreamChunk = {
  type: EventType.RUN_STARTED,
  runId: 'run-1',
  threadId: 'thread-1',
  timestamp: Date.now(),
}

describe('ChatClient resume', () => {
  it('tracks the run/thread of an interrupted run', async () => {
    const { adapter, contexts } = recordingAdapter([
      [
        runStarted,
        text('a'),
        text('b'),
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
          },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter })
    await client.append({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
      createdAt: new Date(),
    })

    const state = client.getResumeState()
    expect(state).not.toBeNull()
    expect(state?.threadId).toBe('thread-1')
    expect(state?.runId).toBe(contexts[0]?.runId)
    expect(state).not.toHaveProperty('cursor')
  })

  it('clears resume state once the run finishes', async () => {
    const { adapter } = recordingAdapter([
      (ctx) => [
        runStarted,
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
          finishReason: 'stop',
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter })
    await client.append({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
      createdAt: new Date(),
    })
    expect(client.getResumeState()).toBeNull()
  })

  it('preserves resume state and tracks pending interrupts on interrupt terminal', async () => {
    const { adapter } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [
              {
                id: 'interrupt-1',
                reason: 'approval_required',
                toolCallId: 'tool-1',
                metadata: { kind: 'approval' },
              },
            ],
          },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')

    expect(client.getResumeState()).toEqual({
      threadId: 'thread-1',
      runId: expect.any(String),
    })
    expect(client.getPendingInterrupts()).toEqual([
      expect.objectContaining({ id: 'interrupt-1' }),
    ])
  })

  it('resumeInterrupts sends AG-UI resume entries with the interrupted run context', async () => {
    const resumeItems: Array<RunAgentResumeItem> = [
      {
        interruptId: 'interrupt-1',
        status: 'resolved',
        payload: { approved: true },
      },
    ]
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [
              {
                id: 'interrupt-1',
                reason: 'approval_required',
                metadata: { kind: 'approval' },
              },
            ],
          },
        },
      ],
      (ctx) => [
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    const resumeState = client.getResumeState()
    await client.resumeInterrupts(resumeItems)

    expect(contexts[1]?.threadId).toBe(resumeState?.threadId)
    expect(contexts[1]?.runId).not.toBe(resumeState?.runId)
    expect(contexts[1]?.parentRunId).toBe(resumeState?.runId)
    expect(contexts[1]?.resume).toEqual(resumeItems)
    expect(client.getPendingInterrupts()).toEqual([])
    expect(client.getResumeState()).toBeNull()
  })

  it('clears interrupts when a resumed provider run has a different run id', async () => {
    const resumeItems: Array<RunAgentResumeItem> = [
      {
        interruptId: 'interrupt-1',
        status: 'resolved',
        payload: { approved: true },
      },
    ]
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
          },
        },
      ],
      [
        {
          type: EventType.RUN_STARTED,
          runId: 'provider-continuation-run',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'provider-continuation-run',
          threadId: 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    expect(client.getPendingInterrupts()).toHaveLength(1)

    await client.resumeInterrupts(resumeItems)

    expect(contexts[1]?.runId).not.toBe('provider-continuation-run')
    expect(client.getResumeState()).toBeNull()
    expect(client.getPendingInterrupts()).toEqual([])
  })

  it.skip('correlates a synthesized resume finish to the client request run', async () => {
    const client = await createInterruptedClient([
      {
        type: EventType.RUN_STARTED,
        runId: 'provider-continuation-run',
        threadId: 'thread-1',
        timestamp: Date.now(),
      },
    ])

    resolveGenericInterrupt(client)

    await vi.waitFor(() => expect(client.getInterrupts()).toEqual([]))
    expect(client.getResumeState()).toBeNull()
    expect(client.getSessionGenerating()).toBe(false)
  })

  it.skip('correlates a synthesized resume error to the client request run', async () => {
    const client = await createInterruptedClient({
      chunks: [
        {
          type: EventType.RUN_STARTED,
          runId: 'provider-continuation-run',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
      ],
      error: new Error('continuation transport failed'),
    })

    resolveGenericInterrupt(client)

    await vi.waitFor(() =>
      expect(client.getInterrupts()[0]?.status).toBe('error'),
    )
    expect(client.getResumeState()).not.toBeNull()
    expect(client.getSessionGenerating()).toBe(false)
  })

  it('resumeInterrupts reconnects with the full current message history', async () => {
    const resumeItems: Array<RunAgentResumeItem> = [
      {
        interruptId: 'interrupt-1',
        status: 'resolved',
        payload: { value: 'ok' },
      },
    ]
    const { adapter, contexts, sentMessages } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
          },
        },
      ],
      [],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    expect(sentMessages[0]).toHaveLength(1)

    await client.resumeInterrupts(resumeItems)

    expect(contexts[1]?.resume).toEqual(resumeItems)
    expect(sentMessages[1]).not.toEqual([])
    expect(sentMessages[1]).toEqual(client.getMessages())
  })

  it('clears resume state and pending interrupts on a runless RUN_ERROR', async () => {
    const { adapter } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
          },
        },
      ],
      [
        {
          type: EventType.RUN_FINISHED,
          runId: 'fresh-send-run',
          threadId: 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    expect(client.getPendingInterrupts()).toHaveLength(1)
    ;(
      client as unknown as {
        observeInterruptState: (chunk: StreamChunk) => void
      }
    ).observeInterruptState({
      type: EventType.RUN_ERROR,
      message: 'session failed',
      timestamp: Date.now(),
    })

    expect(client.getResumeState()).toBeNull()
    expect(client.getPendingInterrupts()).toEqual([])
    await expect(client.sendMessage('fresh')).resolves.toBeUndefined()
  })

  it('blocks normal input while interrupts are pending', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
          },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter })

    await client.sendMessage('hi')
    await expect(client.sendMessage('blocked')).rejects.toThrow(
      'pending interrupts',
    )
    await expect(
      client.append({
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', content: 'blocked' }],
        createdAt: new Date(),
      }),
    ).rejects.toThrow('pending interrupts')

    expect(contexts).toHaveLength(1)
  })

  it('keeps pending interrupts when an unrelated run finishes', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-a',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-a',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-a', reason: 'client_tool_input' }],
          },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    expect(client.getPendingInterrupts()).toHaveLength(1)
    ;(
      client as unknown as {
        observeInterruptState: (chunk: StreamChunk) => void
      }
    ).observeInterruptState({
      type: EventType.RUN_FINISHED,
      runId: 'run-b',
      threadId: 'thread-1',
      timestamp: Date.now(),
      outcome: { type: 'success' },
    })

    expect(client.getPendingInterrupts()).toEqual([
      expect.objectContaining({ id: 'interrupt-a' }),
    ])
    expect(client.getResumeState()?.runId).not.toBe('run-b')
    await expect(client.sendMessage('blocked')).rejects.toThrow(
      'pending interrupts',
    )
    expect(contexts).toHaveLength(1)
  })

  it('keeps pending interrupts when an unrelated run starts and finishes', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-a',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-a',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-a', reason: 'client_tool_input' }],
          },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    const interruptedState = client.getResumeState()
    expect(client.getPendingInterrupts()).toHaveLength(1)
    const internals = client as unknown as {
      updateRunLifecycle: (chunk: StreamChunk) => void
      observeInterruptState: (chunk: StreamChunk) => void
    }
    internals.updateRunLifecycle({
      type: EventType.RUN_STARTED,
      runId: 'run-b',
      threadId: 'thread-1',
      timestamp: Date.now(),
    })
    internals.observeInterruptState({
      type: EventType.RUN_FINISHED,
      runId: 'run-b',
      threadId: 'thread-1',
      timestamp: Date.now(),
      outcome: { type: 'success' },
    })

    expect(client.getResumeState()).toEqual(interruptedState)
    expect(client.getPendingInterrupts()).toEqual([
      expect.objectContaining({ id: 'interrupt-a' }),
    ])
    await expect(client.sendMessage('blocked')).rejects.toThrow(
      'pending interrupts',
    )
    expect(contexts).toHaveLength(1)
  })

  it('keeps pending interrupts when an unrelated run errors', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-a',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-a',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-a', reason: 'client_tool_input' }],
          },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    expect(client.getPendingInterrupts()).toHaveLength(1)
    ;(
      client as unknown as {
        observeInterruptState: (chunk: StreamChunk) => void
      }
    ).observeInterruptState({
      type: EventType.RUN_ERROR,
      runId: 'run-b',
      message: 'unrelated failure',
      timestamp: Date.now(),
    })

    expect(client.getPendingInterrupts()).toEqual([
      expect.objectContaining({ id: 'interrupt-a' }),
    ])
    await expect(
      client.append({
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', content: 'blocked' }],
        createdAt: new Date(),
      }),
    ).rejects.toThrow('pending interrupts')
    expect(contexts).toHaveLength(1)
  })

  it('clear removes resume state and pending interrupts', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
          },
        },
      ],
      [
        {
          type: EventType.RUN_FINISHED,
          runId: 'fresh-send-run',
          threadId: 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
      [
        {
          type: EventType.RUN_FINISHED,
          runId: 'fresh-append-run',
          threadId: 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
    ])
    const seenResumeStates: Array<ReturnType<ChatClient['getResumeState']>> = []
    const seenPendingInterrupts: Array<
      ReturnType<ChatClient['getPendingInterrupts']>
    > = []
    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      onResumeStateChange: (resumeState, pendingInterrupts) => {
        seenResumeStates.push(resumeState)
        seenPendingInterrupts.push(pendingInterrupts)
      },
    })

    await client.sendMessage('hi')
    expect(client.getResumeState()).not.toBeNull()
    expect(client.getPendingInterrupts()).toHaveLength(1)

    client.clear()

    expect(client.getResumeState()).toBeNull()
    expect(client.getPendingInterrupts()).toEqual([])
    expect(seenResumeStates.at(-1)).toBeNull()
    expect(seenPendingInterrupts.at(-1)).toEqual([])
    await expect(client.sendMessage('fresh')).resolves.toBeUndefined()
    await expect(
      client.append({
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', content: 'fresh append' }],
        createdAt: new Date(),
      }),
    ).resolves.toBeUndefined()
    expect(contexts).toHaveLength(3)
  })

  it('addToolApprovalResponse sends a compatibility resume item', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [
              {
                id: 'approval-1',
                reason: 'approval_required',
                toolCallId: 'tool-1',
                metadata: {
                  kind: 'approval',
                  toolName: 'lookup',
                  input: { query: 'first' },
                },
              },
            ],
          },
        },
      ],
      [
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    await client.addToolApprovalResponse({ id: 'approval-1', approved: true })

    expect(contexts[1]?.resume).toEqual([
      {
        interruptId: 'approval-1',
        status: 'resolved',
        payload: { approved: true },
      },
    ])
  })

  it('addToolApprovalResponse waits for all pending approval interrupts before resuming', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [
              {
                id: 'approval-1',
                reason: 'approval_required',
                toolCallId: 'tool-1',
                metadata: {
                  kind: 'approval',
                  toolName: 'lookup',
                  input: { query: 'first' },
                },
              },
              {
                id: 'approval-2',
                reason: 'approval_required',
                toolCallId: 'tool-2',
                metadata: {
                  kind: 'approval',
                  toolName: 'lookup',
                  input: { query: 'second' },
                },
              },
            ],
          },
        },
      ],
      [],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    await client.addToolApprovalResponse({ id: 'approval-1', approved: true })

    expect(contexts).toHaveLength(1)

    await client.addToolApprovalResponse({ id: 'approval-2', approved: false })

    expect(contexts).toHaveLength(2)
    expect(contexts[1]?.resume).toEqual([
      {
        interruptId: 'approval-1',
        status: 'resolved',
        payload: { approved: true },
      },
      {
        interruptId: 'approval-2',
        status: 'resolved',
        payload: { approved: false },
      },
    ])
  })

  it('restores pending interrupts from an initial resume snapshot', async () => {
    const { adapter, contexts } = recordingAdapter([
      [
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
    ])
    const client = new ChatClient({
      connection: adapter,
      initialResumeSnapshot: {
        resumeState: {
          threadId: 'thread-1',
          runId: 'run-1',
        },
        pendingInterrupts: [
          {
            id: 'approval-1',
            reason: 'approval_required',
            toolCallId: 'tool-1',
            metadata: {
              kind: 'approval',
              toolName: 'lookup',
              input: { query: 'restored' },
            },
          },
        ],
      },
    })

    expect(client.getResumeState()).toEqual({
      threadId: 'thread-1',
      runId: 'run-1',
    })
    expect(client.getPendingInterrupts()).toEqual([
      expect.objectContaining({ id: 'approval-1' }),
    ])

    await client.addToolApprovalResponse({ id: 'approval-1', approved: true })

    expect(contexts[0]?.threadId).toBe('thread-1')
    expect(contexts[0]?.runId).not.toBe('run-1')
    expect(contexts[0]?.parentRunId).toBe('run-1')
    expect(contexts[0]?.resume).toEqual([
      {
        interruptId: 'approval-1',
        status: 'resolved',
        payload: { approved: true },
      },
    ])
  })

  it('addToolResult for pending client-tool input sends a resume item', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [
              {
                id: 'interrupt-tool-1',
                reason: 'client_tool_input',
                toolCallId: 'tool-call-1',
                metadata: {
                  kind: 'client_tool',
                  toolName: 'lookup',
                  input: { query: 'first' },
                },
              },
            ],
          },
        },
      ],
      [],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    const resumeState = client.getResumeState()
    await client.addToolResult({
      toolCallId: 'tool-call-1',
      tool: 'lookup',
      output: { answer: 42 },
    })

    expect(contexts[1]?.threadId).toBe(resumeState?.threadId)
    expect(contexts[1]?.runId).not.toBe(resumeState?.runId)
    expect(contexts[1]?.parentRunId).toBe(resumeState?.runId)
    expect(contexts[1]?.resume).toEqual([
      {
        interruptId: 'interrupt-tool-1',
        status: 'resolved',
        payload: { answer: 42 },
      },
    ])
  })

  it('addToolResult waits for all pending client-tool interrupts before resuming', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [
              {
                id: 'interrupt-tool-1',
                reason: 'client_tool_input',
                toolCallId: 'tool-call-1',
                metadata: {
                  kind: 'client_tool',
                  toolName: 'lookup',
                  input: { query: 'first' },
                },
              },
              {
                id: 'interrupt-tool-2',
                reason: 'client_tool_input',
                toolCallId: 'tool-call-2',
                metadata: {
                  kind: 'client_tool',
                  toolName: 'lookup',
                  input: { query: 'second' },
                },
              },
            ],
          },
        },
      ],
      [],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    await client.addToolResult({
      toolCallId: 'tool-call-1',
      tool: 'lookup',
      output: { answer: 42 },
    })

    expect(contexts).toHaveLength(1)

    await client.addToolResult({
      toolCallId: 'tool-call-2',
      tool: 'lookup',
      output: { answer: 43 },
    })

    expect(contexts).toHaveLength(2)
    expect(contexts[1]?.resume).toEqual([
      {
        interruptId: 'interrupt-tool-1',
        status: 'resolved',
        payload: { answer: 42 },
      },
      {
        interruptId: 'interrupt-tool-2',
        status: 'resolved',
        payload: { answer: 43 },
      },
    ])
  })

  it('auto-executed client tool during parent stream defers resume until isLoading clears', async () => {
    const outputSchema = z.object({ answer: z.number() })
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look up',
      inputSchema: z.object({ query: z.string() }),
      outputSchema,
    }).client(async () => ({ answer: 42 }))
    const outputSchemaHash = hashSchemaInput(outputSchema)
    const responseSchema = convertSchemaToJsonSchema(outputSchema) ?? {}
    const responseSchemaHash = digestInterruptJson(
      canonicalInterruptJson(responseSchema),
    )

    const contexts: Array<RunAgentInputContext | undefined> = []
    let connectCount = 0
    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, _signal, runContext) {
        contexts.push(runContext)
        connectCount++
        if (connectCount === 1) {
          const runId = runContext?.runId ?? 'run-1'
          const threadId = runContext?.threadId ?? 'thread-1'
          yield {
            type: EventType.RUN_STARTED,
            runId,
            threadId,
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'tool-call-1',
            toolCallName: 'lookup',
            toolName: 'lookup',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'tool-call-1',
            delta: '{"query":"first"}',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'client_tool_tool-call-1',
                  reason: 'tanstack:client_tool_execution',
                  toolCallId: 'tool-call-1',
                  responseSchema,
                  metadata: {
                    kind: 'client_tool',
                    toolName: 'lookup',
                    input: { query: 'first' },
                    'tanstack:interruptBinding': {
                      kind: 'client-tool-execution',
                      interruptId: 'client_tool_tool-call-1',
                      interruptedRunId: runId,
                      generation: 0,
                      toolName: 'lookup',
                      toolCallId: 'tool-call-1',
                      outputSchemaHash,
                      responseSchemaHash,
                    },
                  },
                },
              ],
            },
          }
          return
        }
        yield {
          type: EventType.RUN_STARTED,
          runId: runContext?.runId ?? 'run-2',
          threadId: runContext?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm1',
          timestamp: Date.now(),
          delta: 'done',
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: runContext?.runId ?? 'run-2',
          threadId: runContext?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          finishReason: 'stop',
        }
      },
    }

    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      tools: [lookup],
    })

    await client.sendMessage('hi')
    // Drain deferred post-stream resume + child run
    for (let i = 0; i < 10 && connectCount < 2; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }

    expect(connectCount).toBe(2)
    expect(contexts[1]?.parentRunId).toBe(contexts[0]?.runId)
    expect(contexts[1]?.resume).toEqual([
      {
        interruptId: 'client_tool_tool-call-1',
        status: 'resolved',
        payload: { answer: 42 },
      },
    ])
    expect(client.getInterruptState().interruptErrors).toEqual([])
  })
})
