import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import type { Interrupt, StreamChunk } from '@tanstack/ai/client'
import type {
  RunAgentInputContext,
  SubscribeConnectionAdapter,
} from '../src/connection-adapters'

function createNativeQueue() {
  const chunks: Array<StreamChunk> = []
  const contexts: Array<RunAgentInputContext | undefined> = []
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
    send: (_messages, _data, _signal, context) => {
      contexts.push(context)
      return Promise.resolve()
    },
  }
  return {
    connection,
    contexts,
    publish(chunk: StreamChunk) {
      chunks.push(chunk)
      const resolve = wake
      wake = undefined
      resolve?.()
    },
  }
}

const interruptedRunId = 'interrupted-run'
const pendingInterrupt: Interrupt = {
  id: 'generic-1',
  reason: 'confirmation',
  metadata: {
    'tanstack:interruptBinding': {
      kind: 'generic',
      interruptId: 'generic-1',
      interruptedRunId,
      generation: 1,
      responseSchemaHash: 'none',
    },
  },
}

describe('ChatClient interrupt error correlation', () => {
  it('does not apply a foreign shared RUN_ERROR to a local interrupt submission', async () => {
    const { connection, contexts, publish } = createNativeQueue()
    const onChunk = vi.fn()
    const client = new ChatClient({
      connection,
      onChunk,
      initialResumeSnapshot: {
        schemaVersion: 2,
        resumeState: { threadId: 'thread-1', runId: interruptedRunId },
        pendingInterrupts: [pendingInterrupt],
        interruptState: {
          recoveryState: {
            schemaVersion: 1,
            state: 'pending',
            threadId: 'thread-1',
            interruptedRunId,
            generation: 1,
            pendingInterrupts: [pendingInterrupt],
          },
          drafts: [],
        },
      },
    })
    const interrupt = client.getInterrupts()[0]
    if (interrupt?.kind !== 'generic') {
      throw new Error('Expected a generic interrupt')
    }

    interrupt.resolveInterrupt({ answer: 'continue' })
    await vi.waitFor(() => expect(contexts).toHaveLength(1))
    publish({
      type: EventType.RUN_ERROR,
      threadId: 'foreign-thread',
      runId: 'foreign-child-run',
      timestamp: Date.now(),
      message: 'foreign run failed',
      'tanstack:interruptErrors': [
        {
          scope: 'item',
          interruptId: 'generic-1',
          code: 'invalid-payload',
          message: 'foreign item error',
          source: 'server',
          retryable: false,
          threadId: 'foreign-thread',
          interruptedRunId: 'foreign-parent-run',
          generation: 7,
        },
        {
          scope: 'batch',
          code: 'item-validation-failed',
          message: 'foreign batch error',
          source: 'server',
          retryable: false,
          interruptIds: ['generic-1'],
          threadId: 'foreign-thread',
          interruptedRunId: 'foreign-parent-run',
          generation: 7,
        },
      ],
    })

    await vi.waitFor(() =>
      expect(client.getInterruptState().resuming).toBe(false),
    )
    expect(onChunk).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'foreign-child-run' }),
    )
    expect(client.getError()?.message).toBe('foreign run failed')
    expect(client.getInterrupts()[0]?.errors).toEqual([])
    expect(client.getInterruptState().interruptErrors).toEqual([
      expect.objectContaining({ code: 'transport', source: 'transport' }),
    ])

    client.retryInterrupts()
    await vi.waitFor(() => expect(contexts).toHaveLength(2))
    const localRunId = contexts[1]?.runId
    if (!localRunId) throw new Error('Expected a local continuation run ID')
    publish({
      type: EventType.RUN_ERROR,
      threadId: 'thread-1',
      runId: localRunId,
      timestamp: Date.now(),
      message: 'local validation failed',
      'tanstack:interruptErrors': [
        {
          scope: 'item',
          interruptId: 'generic-1',
          code: 'invalid-payload',
          message: 'local item error',
          source: 'server',
          retryable: false,
          threadId: 'thread-1',
          interruptedRunId,
          generation: 1,
        },
        {
          scope: 'batch',
          code: 'item-validation-failed',
          message: 'local batch error',
          source: 'server',
          retryable: false,
          interruptIds: ['generic-1'],
          threadId: 'thread-1',
          interruptedRunId,
          generation: 1,
        },
      ],
    })

    await vi.waitFor(() =>
      expect(client.getInterrupts()[0]?.errors).toMatchObject([
        { message: 'local item error', source: 'server' },
      ]),
    )
    expect(client.getInterruptState().interruptErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'transport', source: 'transport' }),
        expect.objectContaining({
          code: 'item-validation-failed',
          message: 'local batch error',
          source: 'server',
        }),
      ]),
    )
    expect(JSON.stringify(client.getInterruptState())).not.toContain('foreign')
    client.dispose()
  })
})
