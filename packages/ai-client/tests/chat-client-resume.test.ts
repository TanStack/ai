import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import {
  createApprovalToolCallChunks,
  createToolCallChunks,
} from './test-utils'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type { RunAgentResumeItem, StreamChunk } from '@tanstack/ai/client'

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

const text = (delta: string, cursor?: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  timestamp: Date.now(),
  delta,
  ...(cursor ? { cursor } : {}),
})
const runStarted: StreamChunk = {
  type: EventType.RUN_STARTED,
  runId: 'run-1',
  threadId: 'thread-1',
  timestamp: Date.now(),
}

describe('ChatClient resume', () => {
  it('tracks the in-band cursor of an interrupted run', async () => {
    const { adapter, contexts } = recordingAdapter([
      [
        runStarted,
        text('a', '1'),
        text('b', '2'),
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
    expect(state?.cursor).toBe('2')
  })

  it('clears resume state once the run finishes', async () => {
    const { adapter } = recordingAdapter([
      (ctx) => [
        runStarted,
        text('a', '1'),
        {
          type: EventType.RUN_FINISHED,
          // Carry the runId the client generated (passed in via runContext) so
          // the terminal correlates to the tracked resume state.
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

  it('resume() reconnects with the cursor in runContext', async () => {
    const { adapter, contexts } = recordingAdapter([
      [
        runStarted,
        text('a', '7'),
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
      [text('b', '8')], // resume continuation
    ])
    const client = new ChatClient({ connection: adapter })
    await client.append({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
      createdAt: new Date(),
    })

    await client.resume()
    expect(contexts).toHaveLength(2)
    // First connect: fresh run, no cursor. Second: resume with the last cursor.
    expect(contexts[0]?.cursor).toBeUndefined()
    expect(contexts[1]?.threadId).toBe('thread-1')
    expect(contexts[1]?.runId).toBe(contexts[0]?.runId)
    expect(contexts[1]?.cursor).toBe('7')
  })

  it('resume(state) reconnects with the supplied thread, run, and cursor', async () => {
    const { adapter, contexts } = recordingAdapter([[]])
    const client = new ChatClient({ connection: adapter, threadId: 'ignored' })

    await client.resume({
      threadId: 'thread-from-state',
      runId: 'run-from-state',
      cursor: 'cursor-from-state',
    })

    expect(contexts[0]?.threadId).toBe('thread-from-state')
    expect(contexts[0]?.runId).toBe('run-from-state')
    expect(contexts[0]?.cursor).toBe('cursor-from-state')
  })

  it('resume() reconnects without re-sending message history', async () => {
    const { adapter, sentMessages } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a', 'cursor-1'),
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

    await client.resume()

    expect(sentMessages[1]).toEqual([])
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
        text('a', 'cursor-1'),
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
      cursor: 'cursor-1',
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
        text('a', 'cursor-1'),
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
    expect(contexts[1]?.cursor).toBe(resumeState?.cursor)
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
        text('a', 'cursor-1'),
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

  it('uses the interrupt terminal cursor for resumeInterrupts', async () => {
    const resumeItems: Array<RunAgentResumeItem> = [
      {
        interruptId: 'interrupt-1',
        status: 'resolved',
        payload: { value: 'ok' },
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
        text('a', 'stale-cursor'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          cursor: 'terminal-cursor',
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
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

    expect(client.getResumeState()).toEqual({
      threadId: 'thread-1',
      runId: expect.any(String),
      cursor: 'terminal-cursor',
    })

    await client.resumeInterrupts(resumeItems)

    expect(contexts[1]?.cursor).toBe('terminal-cursor')
    expect(contexts[1]?.resume).toEqual(resumeItems)
  })

  it('clears resume state and pending interrupts after runless RUN_ERROR', async () => {
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a', 'cursor-1'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          cursor: 'interrupt-cursor',
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
          },
        },
      ],
      [
        {
          type: EventType.RUN_ERROR,
          message: 'session failed',
          timestamp: Date.now(),
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

    await client.resume()

    expect(client.getResumeState()).toBeNull()
    expect(client.getPendingInterrupts()).toEqual([])
    await expect(
      client.append({
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', content: 'fresh append' }],
        createdAt: new Date(),
      }),
    ).resolves.toBeUndefined()
    await expect(client.sendMessage('fresh')).resolves.toBeUndefined()

    expect(contexts).toHaveLength(4)
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
        text('a', 'cursor-1'),
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
        text('a', 'cursor-a'),
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
      client as unknown as { observeResumeCursor: (chunk: StreamChunk) => void }
    ).observeResumeCursor({
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
        text('a', 'cursor-a'),
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
    ;(
      client as unknown as {
        updateRunLifecycle: (chunk: StreamChunk) => void
        observeResumeCursor: (chunk: StreamChunk) => void
      }
    ).updateRunLifecycle({
      type: EventType.RUN_STARTED,
      runId: 'run-b',
      threadId: 'thread-1',
      timestamp: Date.now(),
    })
    ;(
      client as unknown as {
        updateRunLifecycle: (chunk: StreamChunk) => void
        observeResumeCursor: (chunk: StreamChunk) => void
      }
    ).observeResumeCursor({
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
        text('a', 'cursor-a'),
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
      client as unknown as { observeResumeCursor: (chunk: StreamChunk) => void }
    ).observeResumeCursor({
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
        text('a', 'cursor-1'),
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
        text('a', 'cursor-1'),
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

  it('keeps the request run id for cursor-backed approval resume when provider events use their own run id', async () => {
    const providerRunId = 'provider-run-1'
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: providerRunId,
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a', 'cursor-1'),
        {
          type: EventType.RUN_FINISHED,
          runId: providerRunId,
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          cursor: 'cursor-2',
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

    const requestRunId = contexts[0]?.runId
    expect(requestRunId).toBeDefined()
    expect(client.getResumeState()).toEqual({
      threadId: 'thread-1',
      runId: requestRunId,
      cursor: 'cursor-2',
    })

    await client.addToolApprovalResponse({ id: 'approval-1', approved: true })

    expect(contexts[1]?.runId).toBe(requestRunId)
    expect(contexts[1]?.cursor).toBe('cursor-2')
    expect(contexts[1]?.resume).toEqual([
      {
        interruptId: 'approval-1',
        status: 'resolved',
        payload: { approved: true },
      },
    ])
  })

  it('keeps the request run id for non-terminal cursors when provider events use their own run id', async () => {
    const providerRunId = 'provider-run-1'
    const { adapter, contexts } = recordingAdapter([
      (ctx) => [
        {
          type: EventType.RUN_STARTED,
          runId: providerRunId,
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        },
        text('a', 'cursor-1'),
        {
          type: EventType.RUN_FINISHED,
          runId: providerRunId,
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
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')

    const requestRunId = contexts[0]?.runId
    expect(requestRunId).toBeDefined()
    expect(client.getResumeState()).toEqual({
      threadId: 'thread-1',
      runId: requestRunId,
      cursor: 'cursor-1',
    })

    await client.resume()

    expect(contexts[1]?.runId).toBe(requestRunId)
    expect(contexts[1]?.cursor).toBe('cursor-1')
  })

  it('addToolApprovalResponse falls back to legacy continuation for no-cursor interrupts', async () => {
    const { adapter, contexts, sentMessages } = recordingAdapter([
      (ctx) => {
        const approvalChunks = createApprovalToolCallChunks([
          {
            id: 'tool-1',
            name: 'approveSearch',
            arguments: '{"query":"test"}',
            approvalId: 'approval-1',
          },
        ]).slice(0, -1)

        return [
          {
            type: EventType.RUN_STARTED,
            runId: ctx?.runId ?? 'run-1',
            threadId: ctx?.threadId ?? 'thread-1',
            timestamp: Date.now(),
          },
          ...approvalChunks,
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
                    toolName: 'approveSearch',
                    input: { query: 'test' },
                  },
                },
              ],
            },
          },
        ]
      },
      (ctx) => [
        text('approved'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-2',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
      (ctx) => [
        text('fresh'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-3',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    expect(client.getResumeState()).toBeNull()
    expect(client.getPendingInterrupts()).toEqual([])

    await client.addToolApprovalResponse({ id: 'approval-1', approved: true })

    expect(contexts).toHaveLength(2)
    expect(contexts[1]?.cursor).toBeUndefined()
    expect(contexts[1]?.resume).toBeUndefined()
    expect(sentMessages[1]).not.toEqual([])

    await expect(client.sendMessage('fresh')).resolves.toBeUndefined()
    expect(contexts).toHaveLength(3)
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
        text('a', 'cursor-before-interrupt'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          cursor: 'interrupt-cursor',
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
          cursor: 'interrupt-cursor',
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
      cursor: 'interrupt-cursor',
    })
    expect(client.getPendingInterrupts()).toEqual([
      expect.objectContaining({ id: 'approval-1' }),
    ])

    await client.addToolApprovalResponse({ id: 'approval-1', approved: true })

    expect(contexts[0]?.threadId).toBe('thread-1')
    expect(contexts[0]?.runId).toBe('run-1')
    expect(contexts[0]?.cursor).toBe('interrupt-cursor')
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
        text('a', 'cursor-before-interrupt'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          cursor: 'interrupt-cursor',
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
    expect(contexts[1]?.cursor).toBe('interrupt-cursor')
    expect(contexts[1]?.resume).toEqual([
      {
        interruptId: 'interrupt-tool-1',
        status: 'resolved',
        payload: { answer: 42 },
      },
    ])
  })

  it('addToolResult falls back to legacy continuation for no-cursor client-tool interrupts', async () => {
    const { adapter, contexts, sentMessages } = recordingAdapter([
      (ctx) => {
        const toolChunks = createToolCallChunks(
          [
            {
              id: 'tool-call-1',
              name: 'lookup',
              arguments: '{"query":"test"}',
            },
          ],
          'msg-1',
          'test',
          false,
        ).slice(0, -1)

        return [
          {
            type: EventType.RUN_STARTED,
            runId: ctx?.runId ?? 'run-1',
            threadId: ctx?.threadId ?? 'thread-1',
            timestamp: Date.now(),
          },
          ...toolChunks,
          {
            type: EventType.RUN_FINISHED,
            runId: ctx?.runId ?? 'run-1',
            threadId: ctx?.threadId ?? 'thread-1',
            timestamp: Date.now(),
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'client-tool-1',
                  reason: 'client_tool_input',
                  toolCallId: 'tool-call-1',
                  metadata: {
                    kind: 'client_tool',
                    toolName: 'lookup',
                    input: { query: 'test' },
                  },
                },
              ],
            },
          },
        ]
      },
      (ctx) => [
        text('tool result accepted'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-2',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
      (ctx) => [
        text('fresh'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-3',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          outcome: { type: 'success' },
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter, threadId: 'thread-1' })

    await client.sendMessage('hi')
    expect(client.getResumeState()).toBeNull()
    expect(client.getPendingInterrupts()).toEqual([])

    await client.addToolResult({
      toolCallId: 'tool-call-1',
      tool: 'lookup',
      output: { answer: 42 },
    })

    expect(contexts).toHaveLength(2)
    expect(contexts[1]?.cursor).toBeUndefined()
    expect(contexts[1]?.resume).toBeUndefined()
    expect(sentMessages[1]).not.toEqual([])

    await expect(client.sendMessage('fresh')).resolves.toBeUndefined()
    expect(contexts).toHaveLength(3)
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
        text('a', 'cursor-before-interrupt'),
        {
          type: EventType.RUN_FINISHED,
          runId: ctx?.runId ?? 'run-1',
          threadId: ctx?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          cursor: 'interrupt-cursor',
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

  it('maybeAutoResume is a no-op when autoResume is false', async () => {
    const { adapter, contexts } = recordingAdapter([
      [runStarted, text('a', '7')],
    ])
    const client = new ChatClient({ connection: adapter, autoResume: false })
    await client.append({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
      createdAt: new Date(),
    })
    const resumed = await client.maybeAutoResume()
    expect(resumed).toBe(false)
    expect(contexts).toHaveLength(1)
  })
})
