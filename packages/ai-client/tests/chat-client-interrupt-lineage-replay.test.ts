import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import type { Interrupt, StreamChunk } from '@tanstack/ai/client'
import type { SubscribeConnectionAdapter } from '../src/connection-adapters'

/**
 * A connection whose `subscribe()` yields chunks pushed onto it via
 * `publish()`, one at a time, in order. A stand-in for a fresh `ChatClient`
 * replaying a thread's saved AG-UI event history (TanStack/ai#1368).
 */
function createReplayQueue() {
  const chunks: Array<StreamChunk> = []
  let wake: (() => void) | undefined
  const connection: SubscribeConnectionAdapter = {
    async *subscribe(signal) {
      while (!signal?.aborted) {
        const chunk = chunks.shift()
        if (chunk) {
          yield chunk
          continue
        }
        await new Promise<void>((resolve) => {
          wake = resolve
          signal?.addEventListener('abort', () => resolve(), { once: true })
        })
      }
    },
    send: () => Promise.resolve(),
  }
  return {
    connection,
    publish(chunk: StreamChunk) {
      chunks.push(chunk)
      const resolve = wake
      wake = undefined
      resolve?.()
    },
  }
}

function interruptFor(runId: string): Interrupt {
  return {
    id: `generic-${runId}`,
    reason: 'confirmation',
    metadata: {
      'tanstack:interruptBinding': {
        kind: 'generic',
        interruptId: `generic-${runId}`,
        interruptedRunId: runId,
        generation: 1,
        responseSchemaHash: 'none',
      },
    },
  }
}

function runStarted(
  runId: string,
  threadId: string,
  parentRunId?: string,
): StreamChunk {
  return {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
    ...(parentRunId !== undefined ? { parentRunId } : {}),
  } as StreamChunk
}

function runFinishedInterrupt(runId: string, threadId: string): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    timestamp: Date.now(),
    outcome: { type: 'interrupt', interrupts: [interruptFor(runId)] },
  } as StreamChunk
}

function runFinishedSuccess(runId: string, threadId: string): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    timestamp: Date.now(),
    outcome: { type: 'success' },
  } as StreamChunk
}

describe('ChatClient interrupt lineage on replay (#1368)', () => {
  it('clears a resolved interrupt once its continuation run finishes, surviving a re-emitted stale pause', async () => {
    const { connection, publish } = createReplayQueue()
    const seen: Array<StreamChunk> = []
    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
      onChunk: (chunk) => seen.push(chunk),
    })
    client.subscribe()
    const pending = () => client.getInterrupts().length

    async function publishAndSettle(chunk: StreamChunk) {
      publish(chunk)
      await vi.waitFor(() => expect(seen).toContain(chunk))
    }

    await publishAndSettle(runStarted('run-A', 'thread-1'))
    expect(pending()).toBe(0)

    await publishAndSettle(runFinishedInterrupt('run-A', 'thread-1'))
    expect(pending()).toBe(1)

    await publishAndSettle(runStarted('run-B', 'thread-1', 'run-A'))
    expect(pending()).toBe(1)

    // Replay re-emits the same stale pause for run A a second time.
    await publishAndSettle(runFinishedInterrupt('run-A', 'thread-1'))
    expect(pending()).toBe(1)

    await publishAndSettle(runStarted('run-B', 'thread-1', 'run-A'))
    expect(pending()).toBe(1)

    await publishAndSettle(runFinishedSuccess('run-B', 'thread-1'))
    expect(pending()).toBe(0)
  })

  it('keeps a genuinely live interrupt pending when no continuation run exists', async () => {
    const { connection, publish } = createReplayQueue()
    const seen: Array<StreamChunk> = []
    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
      onChunk: (chunk) => seen.push(chunk),
    })
    client.subscribe()
    const pending = () => client.getInterrupts().length

    async function publishAndSettle(chunk: StreamChunk) {
      publish(chunk)
      await vi.waitFor(() => expect(seen).toContain(chunk))
    }

    await publishAndSettle(runStarted('run-A', 'thread-1'))
    expect(pending()).toBe(0)

    await publishAndSettle(runFinishedInterrupt('run-A', 'thread-1'))
    expect(pending()).toBe(1)

    // No continuation of run A ever arrives. The pause must stay live.
    expect(pending()).toBe(1)
  })

  it('does not clear a pending interrupt when an unrelated run on the same thread finishes', async () => {
    const { connection, publish } = createReplayQueue()
    const seen: Array<StreamChunk> = []
    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
      onChunk: (chunk) => seen.push(chunk),
    })
    client.subscribe()
    const pending = () => client.getInterrupts().length

    async function publishAndSettle(chunk: StreamChunk) {
      publish(chunk)
      await vi.waitFor(() => expect(seen).toContain(chunk))
    }

    await publishAndSettle(runStarted('run-A', 'thread-1'))
    await publishAndSettle(runFinishedInterrupt('run-A', 'thread-1'))
    expect(pending()).toBe(1)

    // run-C is a separate, unrelated run on the same thread. No
    // `parentRunId` links it to run-A. Its finishing must not clear run-A's
    // pending approval card.
    await publishAndSettle(runStarted('run-C', 'thread-1'))
    await publishAndSettle(runFinishedSuccess('run-C', 'thread-1'))
    expect(pending()).toBe(1)
  })

  it('stays cleared across a second full replay of the same history (idempotent, out-of-order safe)', async () => {
    const { connection, publish } = createReplayQueue()
    const seen: Array<StreamChunk> = []
    const client = new ChatClient({
      connection,
      threadId: 'thread-1',
      onChunk: (chunk) => seen.push(chunk),
    })
    client.subscribe()
    const pending = () => client.getInterrupts().length

    async function publishAndSettle(chunk: StreamChunk) {
      publish(chunk)
      await vi.waitFor(() => expect(seen).toContain(chunk))
    }

    const sequence = () => [
      runStarted('run-A', 'thread-1'),
      runFinishedInterrupt('run-A', 'thread-1'),
      runStarted('run-B', 'thread-1', 'run-A'),
      runFinishedSuccess('run-B', 'thread-1'),
    ]

    for (const chunk of sequence()) {
      await publishAndSettle(chunk)
    }
    expect(pending()).toBe(0)

    // A reconnect replays the whole thread history again, fresh chunk
    // instances included. By now `run-A` is known-answered from the first
    // pass, so its stale pause must not come back even before `run-B`'s
    // second finish is reprocessed.
    const secondPass = sequence()
    await publishAndSettle(secondPass[0]!)
    expect(pending()).toBe(0)
    await publishAndSettle(secondPass[1]!)
    expect(pending()).toBe(0)
    await publishAndSettle(secondPass[2]!)
    expect(pending()).toBe(0)
    await publishAndSettle(secondPass[3]!)
    expect(pending()).toBe(0)
  })
})
