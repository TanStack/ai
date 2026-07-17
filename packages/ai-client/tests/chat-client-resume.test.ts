import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type { RunAgentResumeItem, StreamChunk } from '@tanstack/ai/client'
import type { ChatResumeSnapshot, ChatServerPersistence } from '../src/types'

/**
 * Adapter that records each connect's runContext and yields scripted chunks.
 * A script can be a function of the live `runContext` (so a test can emit a
 * RUN_FINISHED carrying the same runId the client generated and passed in).
 */
type Script =
  | Array<StreamChunk>
  | ((ctx: RunAgentInputContext | undefined) => Array<StreamChunk>)

function recordingAdapter(scripts: Array<Script>) {
  const contexts: Array<RunAgentInputContext | undefined> = []
  const sentMessages: Array<Array<unknown>> = []
  let i = 0
  const adapter: ConnectConnectionAdapter = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *connect(messages, _data, _signal, runContext) {
      sentMessages.push(messages)
      contexts.push(runContext)
      const script = scripts[i]
      i++
      const chunks =
        typeof script === 'function' ? script(runContext) : (script ?? [])
      for (const c of chunks) yield c
    },
  }
  return { adapter, contexts, sentMessages }
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

function createResumePersistence(
  initial?: ChatResumeSnapshot | null,
): ChatServerPersistence {
  return {
    getItem: vi.fn(() => initial),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
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
    expect(contexts[1]?.runId).toBe(resumeState?.runId)
    expect(contexts[1]?.resume).toEqual(resumeItems)
    expect(client.getPendingInterrupts()).toEqual([])
    expect(client.getResumeState()).toBeNull()
  })

  it('resumeInterrupts reconnects without re-sending message history', async () => {
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
    expect(sentMessages[1]).toEqual([])
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
                metadata: { kind: 'approval' },
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
                metadata: { kind: 'approval' },
              },
              {
                id: 'approval-2',
                reason: 'approval_required',
                toolCallId: 'tool-2',
                metadata: { kind: 'approval' },
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
        status: 'cancelled',
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
            metadata: { kind: 'approval' },
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
    expect(contexts[0]?.runId).toBe('run-1')
    expect(contexts[0]?.resume).toEqual([
      {
        interruptId: 'approval-1',
        status: 'resolved',
        payload: { approved: true },
      },
    ])
  })

  it('hydrates resume state and pending interrupts from persistence.server using thread id', async () => {
    const persistence = createResumePersistence({
      resumeState: {
        threadId: 'thread-1',
        runId: 'run-1',
      },
      pendingInterrupts: [
        {
          id: 'approval-1',
          reason: 'approval_required',
          toolCallId: 'tool-1',
        },
      ],
    })
    const { adapter } = recordingAdapter([[]])

    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
    })

    expect(persistence.getItem).toHaveBeenCalledWith('thread-1')
    expect(client.getResumeState()).toEqual({
      threadId: 'thread-1',
      runId: 'run-1',
    })
    expect(client.getPendingInterrupts()).toEqual([
      expect.objectContaining({ id: 'approval-1' }),
    ])
  })

  it('persists resume snapshots to persistence.server using thread id', async () => {
    const persistence = createResumePersistence()
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
    ])
    const onResumeStateChange = vi.fn()
    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
      onResumeStateChange,
    })

    await client.sendMessage('hi')

    expect(persistence.setItem).toHaveBeenLastCalledWith('thread-1', {
      resumeState: client.getResumeState(),
      pendingInterrupts: client.getPendingInterrupts(),
    })
    expect(onResumeStateChange).toHaveBeenCalled()
  })

  it('removes the server snapshot when resume state is cleared', async () => {
    const persistence = createResumePersistence()
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
    ])
    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
    })

    await client.sendMessage('hi')
    client.clear()

    expect(persistence.removeItem).toHaveBeenCalledWith('thread-1')
  })

  it('swallows server persistence failures', async () => {
    const persistence: ChatServerPersistence = {
      getItem: vi.fn(() => {
        throw new Error('read failed')
      }),
      setItem: vi.fn(() => {
        throw new Error('write failed')
      }),
      removeItem: vi.fn(() => {
        throw new Error('remove failed')
      }),
    }
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
    ])

    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
    })

    await expect(client.sendMessage('hi')).resolves.toBeUndefined()
    expect(() => client.clear()).not.toThrow()
  })

  it('surfaces rejected server persistence writes to onError without breaking chat', async () => {
    const writeError = new Error('write failed')
    const persistence: ChatServerPersistence = {
      getItem: vi.fn(() => undefined),
      setItem: vi.fn(() => Promise.reject(writeError)),
      removeItem: vi.fn(() => Promise.resolve()),
    }
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
    ])
    const onError = vi.fn()

    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
      onError,
    })

    // Chat must not break: the send resolves normally.
    await expect(client.sendMessage('hi')).resolves.toBeUndefined()

    // The rejected persistence write is surfaced to the observable sink.
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(writeError)
    })
  })

  it('surfaces server persistence failures to console.warn when no onError is provided', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const writeError = new Error('write failed')
    const persistence: ChatServerPersistence = {
      getItem: vi.fn(() => undefined),
      setItem: vi.fn(() => Promise.reject(writeError)),
      removeItem: vi.fn(() => Promise.resolve()),
    }
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
    ])

    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
    })

    await expect(client.sendMessage('hi')).resolves.toBeUndefined()

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[TanStack AI] Server persistence adapter error (non-fatal):',
        writeError,
      )
    })

    warnSpy.mockRestore()
  })

  it('prefers explicit initialResumeSnapshot over persistence.server', () => {
    const persistence = createResumePersistence({
      resumeState: {
        threadId: 'thread-1',
        runId: 'stored-run',
      },
      pendingInterrupts: [{ id: 'stored', reason: 'client_tool_input' }],
    })
    const { adapter } = recordingAdapter([[]])

    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
      initialResumeSnapshot: {
        resumeState: {
          threadId: 'thread-1',
          runId: 'explicit-run',
        },
        pendingInterrupts: [{ id: 'explicit', reason: 'client_tool_input' }],
      },
    })

    expect(client.getResumeState()).toEqual({
      threadId: 'thread-1',
      runId: 'explicit-run',
    })
    expect(client.getPendingInterrupts()).toEqual([
      expect.objectContaining({ id: 'explicit' }),
    ])
  })

  it('does not read persistence.server when explicit initialResumeSnapshot is provided', async () => {
    const persistence: ChatServerPersistence = {
      getItem: vi.fn(() => Promise.reject(new Error('read failed'))),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const { adapter } = recordingAdapter([[]])

    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
      initialResumeSnapshot: {
        resumeState: {
          threadId: 'thread-1',
          runId: 'explicit-run',
        },
        pendingInterrupts: [{ id: 'explicit', reason: 'client_tool_input' }],
      },
    })

    await Promise.resolve()

    expect(persistence.getItem).not.toHaveBeenCalled()
    expect(client.getResumeState()).toEqual({
      threadId: 'thread-1',
      runId: 'explicit-run',
    })
    expect(client.getPendingInterrupts()).toEqual([
      expect.objectContaining({ id: 'explicit' }),
    ])
  })

  it('ignores async server hydrate that resolves after clear', async () => {
    const storedSnapshot: ChatResumeSnapshot = {
      resumeState: {
        threadId: 'thread-1',
        runId: 'stored-run',
      },
      pendingInterrupts: [{ id: 'stored', reason: 'client_tool_input' }],
    }
    let resolveHydrate: (snapshot: ChatResumeSnapshot) => void = () => {}
    const persistence: ChatServerPersistence = {
      getItem: vi.fn(
        () =>
          new Promise<ChatResumeSnapshot>((resolve) => {
            resolveHydrate = resolve
          }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const { adapter } = recordingAdapter([[]])
    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
    })

    client.clear()
    resolveHydrate(storedSnapshot)
    await Promise.resolve()

    expect(client.getResumeState()).toBeNull()
    expect(client.getPendingInterrupts()).toEqual([])
    expect(persistence.removeItem).toHaveBeenCalledWith('thread-1')
    expect(persistence.setItem).not.toHaveBeenCalled()
  })

  it('ignores async server hydrate that resolves after dispose', async () => {
    const storedSnapshot: ChatResumeSnapshot = {
      resumeState: {
        threadId: 'thread-1',
        runId: 'stored-run',
      },
      pendingInterrupts: [{ id: 'stored', reason: 'client_tool_input' }],
    }
    let resolveHydrate: (snapshot: ChatResumeSnapshot) => void = () => {}
    const persistence: ChatServerPersistence = {
      getItem: vi.fn(
        () =>
          new Promise<ChatResumeSnapshot>((resolve) => {
            resolveHydrate = resolve
          }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const { adapter } = recordingAdapter([[]])
    const onResumeStateChange = vi.fn()
    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
      onResumeStateChange,
    })

    client.dispose()
    resolveHydrate(storedSnapshot)
    await Promise.resolve()

    expect(client.getResumeState()).toBeNull()
    expect(client.getPendingInterrupts()).toEqual([])
    expect(onResumeStateChange).not.toHaveBeenCalled()
    expect(persistence.setItem).not.toHaveBeenCalled()
  })

  it('hydrates async server resume state without connecting', async () => {
    const storedSnapshot: ChatResumeSnapshot = {
      resumeState: {
        threadId: 'thread-1',
        runId: 'stored-run',
      },
      pendingInterrupts: [],
    }
    let resolveHydrate: (snapshot: ChatResumeSnapshot) => void = () => {}
    const persistence: ChatServerPersistence = {
      getItem: vi.fn(
        () =>
          new Promise<ChatResumeSnapshot>((resolve) => {
            resolveHydrate = resolve
          }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const { adapter, contexts } = recordingAdapter([[]])
    const onResumeStateChange = vi.fn()

    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
      onResumeStateChange,
    })

    resolveHydrate(storedSnapshot)
    await Promise.resolve()
    await Promise.resolve()

    expect(client.getResumeState()).toEqual(storedSnapshot.resumeState)
    expect(onResumeStateChange).toHaveBeenCalledWith(
      storedSnapshot.resumeState,
      [],
    )
    expect(contexts).toHaveLength(0)
  })

  it('does not persist late resume snapshots after server-only clear', async () => {
    const writes: Array<ChatResumeSnapshot | null> = []
    let releaseLateChunk: () => void = () => {}
    let markLateChunkReady: () => void = () => {}
    const lateChunkReady = new Promise<void>((resolve) => {
      markLateChunkReady = resolve
    })
    const persistence: ChatServerPersistence = {
      getItem: vi.fn(() => null),
      setItem: vi.fn((_id, snapshot) => {
        writes.push(snapshot)
      }),
      removeItem: vi.fn(() => {
        writes.push(null)
      }),
    }
    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, _signal, runContext) {
        yield {
          type: EventType.RUN_STARTED,
          runId: runContext?.runId ?? 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        }
        await new Promise<void>((resolve) => {
          releaseLateChunk = resolve
          markLateChunkReady()
        })
        yield text('late')
      },
    }
    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
    })

    const sendPromise = client.sendMessage('hi')
    await lateChunkReady
    client.clear()
    releaseLateChunk()
    await sendPromise

    expect(persistence.removeItem).toHaveBeenCalledWith('thread-1')
    expect(writes.at(-1)).toBeNull()
  })

  it('keeps server resume persistence removed when async set resolves after clear', async () => {
    let storedSnapshot: ChatResumeSnapshot | null = null
    const pendingSets: Array<{
      snapshot: ChatResumeSnapshot
      resolve: () => void
    }> = []
    const persistence: ChatServerPersistence = {
      getItem: vi.fn(() => storedSnapshot),
      setItem: vi.fn((_id, snapshot) => {
        return new Promise<void>((resolve) => {
          pendingSets.push({
            snapshot,
            resolve: () => {
              storedSnapshot = snapshot
              resolve()
            },
          })
        })
      }),
      removeItem: vi.fn(() => {
        storedSnapshot = null
      }),
    }
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
    ])
    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      persistence: { server: persistence },
    })

    await client.sendMessage('hi')
    expect(pendingSets.length).toBeGreaterThan(0)

    client.clear()
    for (const pendingSet of pendingSets) {
      pendingSet.resolve()
    }
    await Promise.all(
      pendingSets.map(
        () => new Promise<void>((resolve) => queueMicrotask(resolve)),
      ),
    )

    expect(persistence.removeItem).toHaveBeenCalledWith('thread-1')
    expect(storedSnapshot).toBeNull()
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
    expect(contexts[1]?.runId).toBe(resumeState?.runId)
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
              },
              {
                id: 'interrupt-tool-2',
                reason: 'client_tool_input',
                toolCallId: 'tool-call-2',
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
})
