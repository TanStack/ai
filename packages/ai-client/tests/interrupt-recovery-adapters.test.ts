import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  createInterruptContinuationLoader,
  createInterruptStateFetcher,
  fetchServerSentEvents,
} from '../src/connection-adapters'
import type { InterruptRecoveryStateV1 } from '@tanstack/ai/client'

const recoveryState: InterruptRecoveryStateV1 = {
  schemaVersion: 1,
  state: 'pending',
  threadId: 'thread-1',
  interruptedRunId: 'run-1',
  generation: 2,
  pendingInterrupts: [],
}

function continuationResponse(): Response {
  return new Response(
    `data: ${JSON.stringify({
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'winner-run',
      timestamp: 1,
      outcome: { type: 'success' },
    })}\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

describe('interrupt recovery fetch adapters', () => {
  it('fetches and strictly parses authoritative state from an explicit URL', async () => {
    const fetchClient = vi.fn<typeof fetch>(async () =>
      Response.json(recoveryState),
    )
    const fetchState = createInterruptStateFetcher('/api/recovery?tenant=one', {
      fetchClient,
      headers: { authorization: 'Bearer test' },
    })

    await expect(
      fetchState({
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        knownGeneration: 2,
      }),
    ).resolves.toEqual(recoveryState)
    const [url, init] = fetchClient.mock.calls[0] ?? []
    expect(String(url)).toBe(
      '/api/recovery?tenant=one&threadId=thread-1&interruptedRunId=run-1&knownGeneration=2',
    )
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test')
  })

  it('rejects malformed recovery JSON instead of trusting the response shape', async () => {
    const fetchState = createInterruptStateFetcher('/api/recovery', {
      fetchClient: vi.fn<typeof fetch>(async () =>
        Response.json({ ...recoveryState, pendingInterrupts: 'not-an-array' }),
      ),
    })

    await expect(
      fetchState({
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        knownGeneration: 2,
      }),
    ).rejects.toThrow('Invalid interrupt recovery response')
  })

  it('wires explicit recovery and continuation operations without posting a new run', async () => {
    const recoveryFetch = vi.fn<typeof fetch>(async () =>
      Response.json(recoveryState),
    )
    const continuationFetch = vi.fn<typeof fetch>(async () =>
      continuationResponse(),
    )
    const chatFetch = vi.fn<typeof fetch>()
    const interruptStateFetcher = createInterruptStateFetcher('/api/recovery', {
      fetchClient: recoveryFetch,
    })
    const continuationLoader = createInterruptContinuationLoader(
      '/api/continuation',
      { fetchClient: continuationFetch },
    )
    const adapter = fetchServerSentEvents('/api/chat', {
      fetchClient: chatFetch,
      interruptStateFetcher,
      continuationLoader,
    })

    await expect(
      adapter.loadInterruptState?.({
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        knownGeneration: 2,
      }),
    ).resolves.toEqual(recoveryState)
    const chunks = []
    for await (const chunk of adapter.joinRun('winner-run')) chunks.push(chunk)

    expect(chunks).toHaveLength(1)
    expect(continuationFetch).toHaveBeenCalledWith(
      '/api/continuation?offset=-1&runId=winner-run',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(chatFetch).not.toHaveBeenCalled()
  })
})
