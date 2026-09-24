import { describe, expect, it, vi } from 'vitest'
import { ByokMissingError } from '@tanstack/ai/byok'
import { defineByok, memoryStorage } from '../src/byok'
import { ChatClient } from '../src/chat-client'
import type { ResumableConnectConnectionAdapter } from '../src/connection-adapters'

/**
 * `persistence: true` loads the thread from the server on mount. When that
 * hydrate GET fails, the failure used to be swallowed by a bare `catch {
 * return }` in `hydrateFromServer` — `onError` never fired, `error` stayed
 * undefined, and `status` stayed `ready` with zero messages, indistinguishable
 * from a genuinely empty thread. `failHydration` now surfaces it, mirroring
 * `GenerationClient.failHydration`.
 *
 * https://github.com/TanStack/ai/issues/1331
 */
describe('mount hydration failure is surfaced (persistence: true)', () => {
  function mounted(options: ConstructorParameters<typeof ChatClient>[0]) {
    const client = new ChatClient(options)
    client.attach()
    return client
  }

  it('reports a thrown hydrate error via onError / error / status', async () => {
    const onError = vi.fn()
    const errors: Array<Error | undefined> = []
    const statuses: Array<string> = []

    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun: async function* () {},
      hydrate: () => Promise.reject(new Error('server returned 500')),
    }

    const client = mounted({
      threadId: 't1',
      connection,
      persistence: true,
      onError,
      onErrorChange: (e) => errors.push(e),
      onStatusChange: (s) => statuses.push(s),
    })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'server returned 500' }),
    )
    expect(errors.at(-1)).toBeInstanceOf(Error)
    expect(client.getError()?.message).toBe('server returned 500')
    expect(client.getStatus()).toBe('error')
    expect(statuses).toContain('error')

    client.dispose()
  })

  it('stays silent when the view detached before the hydrate rejected', async () => {
    const onError = vi.fn()
    let rejectHydration: ((reason: unknown) => void) | undefined
    const gate = new Promise<never>((_, reject) => {
      rejectHydration = reject
    })

    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun: async function* () {},
      hydrate: () => gate,
    }

    const client = mounted({
      threadId: 't1',
      connection,
      persistence: true,
      onError,
    })

    // View switch: detach (NOT dispose) while the hydrate GET is still in flight.
    client.detach()
    rejectHydration?.(new Error('server returned 500'))
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onError).not.toHaveBeenCalled()
    expect(client.getStatus()).not.toBe('error')

    client.dispose()
  })

  it('triggers the BYOK key-request flow when hydrate throws ByokMissingError', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    const onError = vi.fn()

    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun: async function* () {},
      hydrate: () => Promise.reject(new ByokMissingError('openai')),
    }

    const client = mounted({
      threadId: 't1',
      connection,
      persistence: true,
      byok,
      onError,
    })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })
    expect(onError).toHaveBeenCalledWith(expect.any(ByokMissingError))
    expect(byok.getSnapshot().prompt).toEqual({
      provider: 'openai',
      reason: 'missing',
    })

    client.dispose()
  })

  it('clears the hydration error when a later load succeeds', async () => {
    let attempt = 0
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun: async function* () {},
      hydrate: () =>
        ++attempt === 1
          ? Promise.reject(new Error('server returned 500'))
          : Promise.resolve({
              messages: [],
              activeRun: null,
              interrupts: null,
            }),
    }

    const client = mounted({ threadId: 't1', connection, persistence: true })
    await vi.waitFor(() => {
      expect(client.getStatus()).toBe('error')
    })

    // Retry: the view detaches and attaches again, and this load succeeds.
    client.detach()
    client.attach()
    await vi.waitFor(() => {
      expect(attempt).toBe(2)
      expect(client.getError()).toBeUndefined()
    })
    expect(client.getStatus()).not.toBe('error')

    client.dispose()
  })

  it('does not surface anything when hydration succeeds', async () => {
    const onError = vi.fn()
    const statuses: Array<string> = []

    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun: async function* () {},
      hydrate: () =>
        Promise.resolve({ messages: [], activeRun: null, interrupts: null }),
    }

    const client = mounted({
      threadId: 't1',
      connection,
      persistence: true,
      onError,
      onStatusChange: (s) => statuses.push(s),
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onError).not.toHaveBeenCalled()
    expect(client.getError()).toBeUndefined()
    expect(client.getStatus()).not.toBe('error')
    expect(statuses).not.toContain('error')

    client.dispose()
  })
})
