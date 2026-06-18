import { describe, expect, it } from 'vitest'
import {
  InMemoryLockStore,
  LocksCapability,
  getLocks,
  provideLocks,
} from '../src/locks'
import { CapabilityRegistry } from '../src/activities/chat/middleware/capabilities'

describe('InMemoryLockStore', () => {
  it('serializes concurrent withLock calls for the same key', async () => {
    const store = new InMemoryLockStore()
    const order: Array<string> = []

    const first = store.withLock('k', async () => {
      order.push('first-start')
      await new Promise((r) => setTimeout(r, 20))
      order.push('first-end')
      return 1
    })
    // Second acquire happens while first holds the lock.
    const second = store.withLock('k', async () => {
      order.push('second-start')
      order.push('second-end')
      return 2
    })

    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(1)
    expect(b).toBe(2)
    // Second must not interleave: it starts only after first fully ends.
    expect(order).toEqual([
      'first-start',
      'first-end',
      'second-start',
      'second-end',
    ])
  })

  it('runs different keys concurrently', async () => {
    const store = new InMemoryLockStore()
    const order: Array<string> = []

    const a = store.withLock('a', async () => {
      order.push('a-start')
      await new Promise((r) => setTimeout(r, 20))
      order.push('a-end')
    })
    const b = store.withLock('b', async () => {
      order.push('b-start')
      order.push('b-end')
    })

    await Promise.all([a, b])
    // b (different key) runs while a is still waiting on its timeout.
    expect(order.slice(0, 2)).toEqual(['a-start', 'b-start'])
  })

  it('keeps the lock usable after a holder throws', async () => {
    const store = new InMemoryLockStore()
    await expect(
      store.withLock('k', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    // Lock is not poisoned: a subsequent acquire still runs.
    await expect(store.withLock('k', async () => 'ok')).resolves.toBe('ok')
  })
})

describe('LocksCapability', () => {
  it('is named "locks"', () => {
    expect(LocksCapability.capabilityName).toBe('locks')
  })

  it('round-trips a LockStore through provide/get', () => {
    const ctx = { capabilities: new CapabilityRegistry() }
    const store = new InMemoryLockStore()
    provideLocks(ctx, store)
    expect(getLocks(ctx)).toBe(store)
  })

  it('getLocks returns undefined when optional and not provided', () => {
    const ctx = { capabilities: new CapabilityRegistry() }
    expect(getLocks(ctx, { optional: true })).toBeUndefined()
  })
})
