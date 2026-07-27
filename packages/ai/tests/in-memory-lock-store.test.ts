import { describe, expect, it } from 'vitest'
import { InMemoryLockStore } from '../src'

describe('InMemoryLockStore', () => {
  it('serializes concurrent withLock calls on the same key', async () => {
    const locks = new InMemoryLockStore()
    const order: Array<number> = []
    await Promise.all([
      locks.withLock('k', async () => {
        order.push(1)
        await Promise.resolve()
        order.push(2)
      }),
      locks.withLock('k', async () => {
        order.push(3)
      }),
    ])
    expect(order).toEqual([1, 2, 3])
  })

  it('releases the lock when the critical section throws', async () => {
    const locks = new InMemoryLockStore()
    await expect(
      locks.withLock('throw-key', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom')

    const result = await locks.withLock('throw-key', () =>
      Promise.resolve('recovered'),
    )
    expect(result).toBe('recovered')
  })

  it('returns the critical section value', async () => {
    const locks = new InMemoryLockStore()
    const result = await locks.withLock('v', () => Promise.resolve(42))
    expect(result).toBe(42)
  })
})
