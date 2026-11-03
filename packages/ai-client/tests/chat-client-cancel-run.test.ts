import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import {
  fetchHttpStream,
  fetchServerSentEvents,
} from '../src/connection-adapters'

/**
 * A fetch that keeps the chat POST open until its signal aborts, and records
 * every other request (the cancel POST) with a 204 reply.
 */
function fakeFetch(cancelStatus = 204) {
  const chatSignals: Array<AbortSignal> = []
  const cancels: Array<{ url: string; init: RequestInit }> = []
  const fetchClient = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url.endsWith('/cancel')) {
        cancels.push({ url, init: init ?? {} })
        return Promise.resolve(new Response(null, { status: cancelStatus }))
      }
      const signal = init?.signal
      if (!signal) return Promise.reject(new Error('chat POST had no signal'))
      chatSignals.push(signal)
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      })
    },
  )
  return { fetchClient, chatSignals, cancels }
}

describe('ChatClient.stop() with cancelUrl', () => {
  it.each([
    ['fetchServerSentEvents', fetchServerSentEvents],
    ['fetchHttpStream', fetchHttpStream],
  ] as const)('%s posts { runId, threadId } to cancelUrl', async (_, make) => {
    const { fetchClient, chatSignals, cancels } = fakeFetch()
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: make('/api/chat', {
        fetchClient,
        cancelUrl: '/api/chat/cancel',
        headers: { Authorization: 'Bearer t' },
      }),
    })
    void client.sendMessage('hi')
    await vi.waitFor(() => expect(chatSignals).toHaveLength(1))
    const runId = client.getCurrentRunId()
    expect(runId).toEqual(expect.any(String))

    client.stop()

    expect(chatSignals[0]!.aborted).toBe(true)
    await vi.waitFor(() => expect(cancels).toHaveLength(1))
    const { init } = cancels[0]!
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer t' })
    expect(JSON.parse(String(init.body))).toEqual({
      runId,
      threadId: 'thread-1',
    })
  })

  it('reads cancelUrl from an options function', async () => {
    const { fetchClient, chatSignals, cancels } = fakeFetch()
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fetchServerSentEvents('/api/chat', () => ({
        fetchClient,
        cancelUrl: () => '/api/chat/cancel',
      })),
    })
    void client.sendMessage('hi')
    await vi.waitFor(() => expect(chatSignals).toHaveLength(1))
    client.stop()
    await vi.waitFor(() => expect(cancels).toHaveLength(1))
  })

  it('a failed cancel does not throw from stop()', async () => {
    const { fetchClient, chatSignals, cancels } = fakeFetch(500)
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fetchServerSentEvents('/api/chat', {
        fetchClient,
        cancelUrl: '/api/chat/cancel',
      }),
    })
    void client.sendMessage('hi')
    await vi.waitFor(() => expect(chatSignals).toHaveLength(1))
    expect(() => client.stop()).not.toThrow()
    await vi.waitFor(() => expect(cancels).toHaveLength(1))
    expect(client.getSnapshot().status).toBe('ready')
  })

  it('an unmount (unsubscribe) does not cancel the run', async () => {
    const { fetchClient, chatSignals, cancels } = fakeFetch()
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fetchServerSentEvents('/api/chat', {
        fetchClient,
        cancelUrl: '/api/chat/cancel',
      }),
    })
    void client.sendMessage('hi')
    await vi.waitFor(() => expect(chatSignals).toHaveLength(1))
    client.unsubscribe()
    expect(chatSignals[0]!.aborted).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(cancels).toHaveLength(0)
  })

  it('without cancelUrl, stop() sends no extra request', async () => {
    const { fetchClient, chatSignals } = fakeFetch()
    const connection = fetchServerSentEvents('/api/chat', { fetchClient })
    expect(connection.cancelRun).toBeUndefined()
    const client = new ChatClient({ threadId: 'thread-1', connection })
    void client.sendMessage('hi')
    await vi.waitFor(() => expect(chatSignals).toHaveLength(1))
    client.stop()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetchClient).toHaveBeenCalledTimes(1)
  })
})

describe('cancelRun request deadline', () => {
  it('sends the cancel POST with a signal, so a dead cancelUrl cannot hold it', async () => {
    const { fetchClient, cancels } = fakeFetch()
    const connection = fetchServerSentEvents('/api/chat', {
      fetchClient,
      cancelUrl: '/api/chat/cancel',
    })
    await connection.cancelRun?.({ runId: 'run-1', threadId: 'thread-1' })
    expect(cancels).toHaveLength(1)
    expect(cancels[0]!.init.signal).toBeInstanceOf(AbortSignal)
    expect(cancels[0]!.init.signal?.aborted).toBe(false)
  })
})
