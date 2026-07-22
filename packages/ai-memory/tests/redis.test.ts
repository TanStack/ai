// @ts-expect-error -- ioredis-mock has no bundled types; the adapter only uses
//   the lowercase RedisLike subset ioredis-mock implements (cast below).
import RedisMock from 'ioredis-mock'
import { describe, expect, it, vi } from 'vitest'
import { nodeRedisAsRedisLike, redis } from '../src/redis'
import type { RedisLike } from '../src/redis'
import { runMemoryAdapterContract } from './contract'

function mockClient(): RedisLike {
  return new RedisMock() as unknown as RedisLike
}

runMemoryAdapterContract('redis', () =>
  redis({ redis: mockClient(), prefix: `test:${crypto.randomUUID()}` }),
)

describe('redis malformed rows', () => {
  it('skips a malformed record on read but does NOT delete it', async () => {
    const prefix = `test:${crypto.randomUUID()}`
    const client = mockClient()
    const adapter = redis({ redis: client, prefix })
    const scope = { sessionId: 's', userId: 'u' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await adapter.save(scope, {
        user: 'good memory about penguins',
        assistant: 'noted',
      })
      // Find the stored record ids from the scope index and corrupt one.
      const indexKey = `${prefix}:index:u:s`
      const ids = await client.smembers(indexKey)
      expect(ids.length).toBeGreaterThan(0)
      const badId = ids[0] as string
      const badKey = `${prefix}:record:${badId}`
      await client.set(badKey, '{ not valid json')

      // recall skips the corrupted row without throwing.
      const result = await adapter.recall(scope, 'penguins')
      expect(result.fragments?.some((f) => f.source === badId)).toBeFalsy()

      // Load-bearing: the malformed row is LEFT IN PLACE, not deleted.
      expect(await client.get(badKey)).toBe('{ not valid json')
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('redis scope-key hardening', () => {
  it('escapes the delimiter so scope values containing ":" cannot collide', async () => {
    const prefix = `test:${crypto.randomUUID()}`
    const client = mockClient()
    const adapter = redis({ redis: client, prefix })

    // Without escaping, { userId: 'a:b', sessionId: 'c' } and
    // { userId: 'a', sessionId: 'b:c' } both serialize to key `a:b:c`.
    await adapter.save({ userId: 'a:b', sessionId: 'c' }, {
      user: 'confidential tenant one data',
      assistant: 'ok',
    })
    const other = await adapter.recall({ userId: 'a', sessionId: 'b:c' }, 'confidential')
    expect(other.systemPrompt).toBe('')
    expect(other.fragments ?? []).toHaveLength(0)
  })
})

describe('nodeRedisAsRedisLike', () => {
  it('translates camelCase node-redis methods into lowercase RedisLike calls', async () => {
    const calls: Array<{ method: string; args: Array<unknown> }> = []
    const fakeNodeRedis = {
      get: async (key: string) => {
        calls.push({ method: 'get', args: [key] })
        return null
      },
      set: async (key: string, value: string) => {
        calls.push({ method: 'set', args: [key, value] })
        return 'OK'
      },
      del: async (keys: Array<string> | string) => {
        calls.push({ method: 'del', args: [keys] })
        return Array.isArray(keys) ? keys.length : 1
      },
      sAdd: async (key: string, members: string | Array<string>) => {
        calls.push({ method: 'sAdd', args: [key, members] })
        return Array.isArray(members) ? members.length : 1
      },
      sRem: async (key: string, members: string | Array<string>) => {
        calls.push({ method: 'sRem', args: [key, members] })
        return Array.isArray(members) ? members.length : 1
      },
      sMembers: async (key: string) => {
        calls.push({ method: 'sMembers', args: [key] })
        return []
      },
      mGet: async (keys: Array<string>) => {
        calls.push({ method: 'mGet', args: [keys] })
        return []
      },
    }

    const wrapped = nodeRedisAsRedisLike(fakeNodeRedis)
    await wrapped.set('k', 'v')
    await wrapped.sadd('s', 'a', 'b')
    await wrapped.mget('k1', 'k2')
    await wrapped.del('d1', 'd2')

    expect(calls.find((c) => c.method === 'set')).toMatchObject({ args: ['k', 'v'] })
    // Variadic members forwarded as an array so node-redis' overload resolves right.
    expect(
      calls.find(
        (c) =>
          c.method === 'sAdd' &&
          Array.isArray(c.args[1]) &&
          (c.args[1] as Array<string>).length === 2,
      ),
    ).toBeTruthy()
    expect(calls.find((c) => c.method === 'mGet')).toMatchObject({ args: [['k1', 'k2']] })
    expect(calls.find((c) => c.method === 'del')).toMatchObject({ args: [['d1', 'd2']] })
  })
})
