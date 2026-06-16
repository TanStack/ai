import { describe, expect, it } from 'vitest'
import { InMemoryLockStore, InMemorySandboxStore } from '../src/store'

describe('InMemorySandboxStore', () => {
  it('round-trips upsert/get/delete', async () => {
    const store = new InMemorySandboxStore()
    expect(await store.get('k')).toBeNull()
    await store.upsert({
      key: 'k',
      provider: 'docker',
      providerSandboxId: 'sbx-1',
      threadId: 't',
      updatedAt: 1,
    })
    expect((await store.get('k'))?.providerSandboxId).toBe('sbx-1')
    await store.delete('k')
    expect(await store.get('k')).toBeNull()
  })
})

describe('InMemoryLockStore', () => {
  it('serializes same-key critical sections', async () => {
    const locks = new InMemoryLockStore()
    const order: Array<string> = []
    const slow = (tag: string, ms: number) =>
      locks.withLock('k', async () => {
        order.push(`${tag}:start`)
        await new Promise((r) => setTimeout(r, ms))
        order.push(`${tag}:end`)
      })

    await Promise.all([slow('a', 20), slow('b', 1)])

    // b cannot start until a fully ends.
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('a rejection in one holder does not poison the lock', async () => {
    const locks = new InMemoryLockStore()
    await expect(
      locks.withLock('k', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom')
    // subsequent acquire still works
    await expect(
      locks.withLock('k', () => Promise.resolve('ok')),
    ).resolves.toBe('ok')
  })

  it('runs different keys concurrently', async () => {
    const locks = new InMemoryLockStore()
    const order: Array<string> = []
    await Promise.all([
      locks.withLock('a', async () => {
        await new Promise((r) => setTimeout(r, 20))
        order.push('a')
      }),
      locks.withLock('b', async () => {
        order.push('b')
      }),
    ])
    // b (different key) finishes first despite a starting first
    expect(order).toEqual(['b', 'a'])
  })
})
