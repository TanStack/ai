import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text } from './helpers'

const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

/** Longer than every timer of a host: renew, snapshot, idle close. */
const IDLE_MS = 10 * 60_000

/**
 * Memory stores that write the name of each method call to `calls`, as
 * `store.method`.
 */
function countedPersistence() {
  const persistence = memoryPersistence()
  const calls: Array<string> = []
  const counted = (name: string, store: object) =>
    new Proxy(store, {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver)
        if (typeof value !== 'function') return value
        return (...args: Array<unknown>) => {
          calls.push(`${name}.${String(key)}`)
          return value.apply(target, args)
        }
      },
    })
  const stores = Object.fromEntries(
    Object.entries(persistence.stores).map(([name, store]) => [
      name,
      typeof store === 'object' ? counted(name, store) : store,
    ]),
  ) as typeof persistence.stores
  return { persistence: { ...persistence, stores }, calls }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('an idle session', () => {
  it('makes no store calls after its turn, while a handle holds it, and after it closes', async () => {
    // Fake timers that also move with real time, so the turn runs as usual
    // and the idle time below fires every timer of the host.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { persistence, calls } = countedPersistence()
    const { adapter } = mockAdapter(() => text('Hello back.'))
    const harness = defineHarness({ name: 'test/idle-budget', adapter })
    const host = createHarnessHost({
      persistence,
      lifecycle: { closeIdleSessionsAfterMs: 1_000 },
    })
    const session = await host.open(harness, { threadId: 't1' })
    await session.send('hi')
    // The session gives its log back when its work ends.
    await waitFor(() => expect(calls).toContain('log.releaseOwnership'))
    await vi.advanceTimersByTimeAsync(100)
    // The spy sees the writes of the turn.
    expect(calls).toContain('log.append')

    const afterTurn = calls.length
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    expect(calls.slice(afterTurn)).toEqual([])
    expect(host.isOpen(harness, { threadId: 't1' })).toBe(true)

    await session.close()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(host.isOpen(harness, { threadId: 't1' })).toBe(false)
    const afterClose = calls.length
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    expect(calls.slice(afterClose)).toEqual([])
    await host.close()
  })
})
