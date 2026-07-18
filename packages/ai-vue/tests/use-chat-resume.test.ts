import { EventType } from '@tanstack/ai'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { RunAgentResumeItem, StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
  SubscribeConnectionAdapter,
} from '@tanstack/ai-client'
import { createMockConnectionAdapter, renderUseChat } from './test-utils'

/**
 * Poll `check` across microtask/macrotask boundaries until it stops throwing.
 * `@vue/test-utils` ships `flushPromises` but no `waitFor`, and live-mode
 * stream chunks land over several async ticks.
 */
async function waitFor(check: () => void, timeout = 1000) {
  const start = Date.now()
  for (;;) {
    try {
      check()
      return
    } catch (err) {
      if (Date.now() - start > timeout) throw err
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
}

/**
 * A connect adapter that records the `runContext` of each connect and echoes a
 * success terminal for the interrupted run so a resume clears cleanly.
 */
function recordingResumeAdapter() {
  const contexts: Array<RunAgentInputContext | undefined> = []
  const adapter: ConnectConnectionAdapter = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *connect(_messages, _data, _signal, runContext) {
      contexts.push(runContext)
      yield {
        type: EventType.RUN_FINISHED,
        runId: runContext?.runId ?? 'run-1',
        threadId: runContext?.threadId ?? 'thread-1',
        timestamp: Date.now(),
        outcome: { type: 'success' },
      } as StreamChunk
    },
  }
  return { adapter, contexts }
}

describe('useChat resume surface', () => {
  it('hydrates resumeState and pendingInterrupts from initialResumeSnapshot', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderUseChat({
      connection: adapter,
      threadId: 'thread-1',
      initialResumeSnapshot: {
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
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

    expect(result.current.resumeState).toEqual({
      threadId: 'thread-1',
      runId: 'run-1',
    })
    expect(result.current.pendingInterrupts).toEqual([
      expect.objectContaining({ id: 'approval-1' }),
    ])
  })

  it('resumeInterrupts forwards resume items to the client and clears pending interrupts', async () => {
    const { adapter, contexts } = recordingResumeAdapter()
    const { result } = renderUseChat({
      connection: adapter,
      threadId: 'thread-1',
      initialResumeSnapshot: {
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
      },
    })

    const resumeItems: Array<RunAgentResumeItem> = [
      { interruptId: 'interrupt-1', status: 'resolved', payload: { value: 'ok' } },
    ]
    await result.current.resumeInterrupts(resumeItems)
    await flushPromises()

    expect(contexts[0]?.threadId).toBe('thread-1')
    expect(contexts[0]?.runId).toBe('run-1')
    expect(contexts[0]?.resume).toEqual(resumeItems)

    expect(result.current.pendingInterrupts).toEqual([])
    expect(result.current.resumeState).toBeNull()
  })

  it('updates resumeState and pendingInterrupts reactively via onResumeStateChange', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: EventType.RUN_STARTED,
        runId: 'run-live-interrupt',
        threadId: 'thread-live',
        timestamp: Date.now(),
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'run-live-interrupt',
        threadId: 'thread-live',
        timestamp: Date.now(),
        outcome: {
          type: 'interrupt',
          interrupts: [{ id: 'interrupt-live', reason: 'client_tool_input' }],
        },
      },
    ]
    const adapter: SubscribeConnectionAdapter = {
      subscribe: async function* () {
        for (const chunk of chunks) yield chunk
      },
      send: vi.fn(async () => {}),
    }

    const { result } = renderUseChat({ connection: adapter, live: true })

    // No sendMessage() wrapper call here — the update must arrive purely
    // through the client's onResumeStateChange callback into the ref.
    await waitFor(() => {
      expect(result.current.resumeState).toEqual({
        threadId: 'thread-live',
        runId: 'run-live-interrupt',
      })
      expect(result.current.pendingInterrupts).toEqual([
        expect.objectContaining({ id: 'interrupt-live' }),
      ])
    })
  })
})
