import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
} from './test-utils'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

/**
 * Regression for https://github.com/TanStack/ai/issues/421
 *
 * After a client-side tool call runs, the client posts the tool result and
 * auto-continues. A custom backend can answer that continuation run with a
 * bare `RUN_FINISHED { finishReason: 'stop' }` and no assistant text/message.
 * In that case the StreamProcessor's finalizeStream() has no
 * `lastAssistantMessage` to emit `onStreamEnd` for, so `setStatus('ready')`
 * never fires and status never settles. The issue reports this as stuck on
 * `streaming`; the underlying stuck value is actually `submitted`, since
 * `streaming` is only set by `onStreamStart` (which a bare `RUN_FINISHED`
 * never triggers).
 */
describe('client tool call status (issue #421)', () => {
  function createDeferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  it('settles status to ready after a client tool when the continuation run emits only RUN_FINISHED', async () => {
    // Round 1: the server asks for a CLIENT tool call (finishReason 'tool_calls').
    const round1Chunks = createToolCallChunks([
      { id: 'tc-1', name: 'get_weather', arguments: '{"city":"NYC"}' },
    ])
    // Round 2: the custom backend (as in the issue) closes the run with only a
    // bare RUN_FINISHED — no assistant message, no text — after receiving the
    // client tool result.
    const round2Chunks: Array<StreamChunk> = [
      {
        type: 'RUN_FINISHED',
        runId: 'run-2',
        threadId: 'thread-2',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk,
    ]

    let callIndex = 0
    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        callIndex++
        const chunks = callIndex === 1 ? round1Chunks : round2Chunks
        for (const chunk of chunks) {
          if (abortSignal?.aborted) return
          yield chunk
        }
      },
    }

    // Controlled promise so the client tool's resolution is deterministic and
    // the test is not racy.
    const toolGate = createDeferred<void>()

    const statuses: Array<string> = []
    const client = new ChatClient({
      connection: adapter,
      onStatusChange: (s) => statuses.push(s),
      tools: [
        {
          __toolSide: 'client' as const,
          name: 'get_weather',
          description: 'Get the weather',
          execute: async () => {
            await toolGate.promise
            return { temp: 72 }
          },
        },
      ],
    })

    const sendPromise = client.sendMessage('What is the weather in NYC?')

    // Let round 1 stream through and the client tool begin executing.
    await vi.waitFor(() => {
      expect(callIndex).toBe(1)
    })

    // Release the client tool; this posts the result and triggers the
    // continuation (round 2).
    toolGate.resolve()
    await sendPromise

    await vi.waitFor(
      () => {
        expect(client.getIsLoading()).toBe(false)
        expect(callIndex).toBeGreaterThanOrEqual(2)
      },
      { timeout: 2000 },
    )

    // The run is fully complete (finishReason 'stop'); status must settle to
    // 'ready', not stay stuck at 'submitted'.
    expect(client.getStatus()).toBe('ready')
    expect(statuses[statuses.length - 1]).toBe('ready')
  })

  it("plain text run emits onStatusChange('ready') exactly once", async () => {
    // A normal run with an assistant message: onStreamEnd fires and sets
    // 'ready'. The terminal normalization added for #421 is guarded on
    // `status !== 'ready'`, so it must NOT double-emit 'ready' here.
    const adapter = createMockConnectionAdapter({
      chunks: createTextChunks('Hello'),
    })

    const statuses: Array<string> = []
    const client = new ChatClient({
      connection: adapter,
      onStatusChange: (s) => statuses.push(s),
    })

    await client.sendMessage('Hi')

    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(false)
    })

    expect(client.getStatus()).toBe('ready')
    expect(statuses.filter((s) => s === 'ready').length).toBe(1)
  })

  it('sendMessage with a bare RUN_FINISHED{stop} first run (no assistant message) settles to ready', async () => {
    // Sibling of the #421 repro on the FIRST run: the backend closes the run
    // immediately with a bare RUN_FINISHED and no assistant message, so
    // onStreamEnd never fires. Status must still settle to 'ready'.
    const chunks: Array<StreamChunk> = [
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        threadId: 'thread-1',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk,
    ]

    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        for (const chunk of chunks) {
          if (abortSignal?.aborted) return
          yield chunk
        }
      },
    }

    const statuses: Array<string> = []
    const client = new ChatClient({
      connection: adapter,
      onStatusChange: (s) => statuses.push(s),
    })

    await client.sendMessage('Hi')

    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(false)
    })

    expect(client.getStatus()).toBe('ready')
    expect(statuses[statuses.length - 1]).toBe('ready')
  })
})
