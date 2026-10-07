import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import type {
  ChatHydrationResult,
  ResumableConnectConnectionAdapter,
} from '../src/connection-adapters'
import type { ChatPersistedState } from '../src/types'
import type { UIMessage } from '@tanstack/ai'

const message: UIMessage = {
  id: 'm1',
  role: 'user',
  parts: [{ type: 'text', content: 'hi' }],
}

function gated() {
  let resolve!: (result: ChatHydrationResult) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<ChatHydrationResult>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('ChatClient isHydrating', () => {
  it('is true from construction until the server transcript is applied', async () => {
    const gate = gated()
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun: async function* () {},
      hydrate: () => gate.promise,
    }
    const seen: Array<{ isHydrating: boolean; messages: number }> = []
    const client: ChatClient = new ChatClient({
      threadId: 't1',
      connection,
      persistence: true,
      onHydratingChange: (isHydrating) =>
        seen.push({ isHydrating, messages: client.getMessages().length }),
    })

    expect(client.getIsHydrating()).toBe(true)
    client.attach()
    expect(client.getIsHydrating()).toBe(true)

    gate.resolve({ messages: [message], activeRun: null, interrupts: null })
    await vi.waitFor(() => expect(client.getIsHydrating()).toBe(false))
    // The flag turns off only after the messages are in place.
    expect(seen).toEqual([{ isHydrating: false, messages: 1 }])

    client.dispose()
  })

  it('turns off with isLoading already on when it re-joins an in-flight run', async () => {
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun: async function* (_runId, signal) {
        await new Promise((resolve) =>
          signal?.addEventListener('abort', resolve),
        )
      },
      hydrate: () =>
        Promise.resolve({
          messages: [message],
          activeRun: { runId: 'run-1' },
          interrupts: null,
        }),
    }
    let loadingWhenHydrated: boolean | undefined
    const client = new ChatClient({
      threadId: 't1',
      connection,
      persistence: true,
      onHydratingChange: (isHydrating) => {
        if (!isHydrating) loadingWhenHydrated = client.getIsLoading()
      },
    })
    client.attach()

    await vi.waitFor(() => expect(client.getIsHydrating()).toBe(false))
    expect(loadingWhenHydrated).toBe(true)

    client.dispose()
  })

  it('turns off when the server hydrate fails', async () => {
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun: async function* () {},
      hydrate: () => Promise.reject(new Error('server returned 500')),
    }
    const client = new ChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })
    client.attach()

    await vi.waitFor(() => expect(client.getStatus()).toBe('error'))
    expect(client.getIsHydrating()).toBe(false)

    client.dispose()
  })

  it('stays on across a detach and re-attach that reuse the same request', async () => {
    const gate = gated()
    const hydrate = vi.fn(() => gate.promise)
    const client = new ChatClient({
      threadId: 't1',
      connection: {
        connect: async function* () {},
        joinRun: async function* () {},
        hydrate,
      },
      persistence: true,
    })
    client.attach()
    client.detach()
    client.attach()
    expect(hydrate).toHaveBeenCalledTimes(1)
    expect(client.getIsHydrating()).toBe(true)

    gate.resolve({ messages: [], activeRun: null, interrupts: null })
    await vi.waitFor(() => expect(client.getIsHydrating()).toBe(false))

    client.dispose()
  })

  it('is true until an async storage adapter has read the transcript', async () => {
    let resolveRead!: (value: ChatPersistedState) => void
    const read = new Promise<ChatPersistedState>((resolve) => {
      resolveRead = resolve
    })
    const client = new ChatClient({
      threadId: 't1',
      connection: { connect: async function* () {} },
      persistence: {
        getItem: () => read,
        setItem: async () => {},
        removeItem: async () => {},
      },
    })

    expect(client.getIsHydrating()).toBe(true)
    resolveRead({ messages: [message] })
    await vi.waitFor(() => expect(client.getIsHydrating()).toBe(false))
    expect(client.getMessages()).toHaveLength(1)

    client.dispose()
  })

  it('is always false without persistence', () => {
    const client = new ChatClient({
      connection: { connect: async function* () {} },
    })
    client.attach()
    expect(client.getIsHydrating()).toBe(false)
    client.dispose()
  })
})
