// @ts-expect-error -- ioredis-mock has no bundled types and we don't need them
//   here; the contract test only exercises the RedisLike subset that
//   redisMemoryAdapter consumes (cast to `never` below).
import RedisMock from 'ioredis-mock'
import { describe, expect, it } from 'vitest'
import { runMemoryAdapterContract } from './contract'
import { nodeRedisAsRedisLike, redisMemoryAdapter } from '../src/adapters/redis'

runMemoryAdapterContract('redisMemoryAdapter', async () => {
  const client = new RedisMock()
  return redisMemoryAdapter({
    redis: client as never,
    prefix: `test:${crypto.randomUUID()}`,
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
      scan: async (
        cursor: number,
        opts?: { MATCH?: string; COUNT?: number },
      ) => {
        calls.push({ method: 'scan', args: [cursor, opts] })
        return { cursor: 0, keys: [] as Array<string> }
      },
    }

    const wrapped = nodeRedisAsRedisLike(fakeNodeRedis)

    await wrapped.set('k', 'v')
    await wrapped.sadd('s', 'a', 'b')
    await wrapped.sadd('s', 'c')
    await wrapped.mget('k1', 'k2')
    const scanResult = await wrapped.scan(
      '0',
      'MATCH',
      'pattern:*',
      'COUNT',
      '50',
    )
    await wrapped.del('d1', 'd2')

    expect(calls.find((c) => c.method === 'set')).toMatchObject({
      args: ['k', 'v'],
    })
    // First sAdd was called with two members; assert it was forwarded as an
    // array (not as variadic args) so node-redis' single-or-array overload
    // resolves to the array branch.
    expect(
      calls.find(
        (c) =>
          c.method === 'sAdd' &&
          Array.isArray(c.args[1]) &&
          (c.args[1] as Array<string>).length === 2,
      ),
    ).toBeTruthy()
    expect(calls.find((c) => c.method === 'mGet')).toMatchObject({
      args: [['k1', 'k2']],
    })
    expect(calls.find((c) => c.method === 'scan')).toMatchObject({
      args: [0, { MATCH: 'pattern:*', COUNT: 50 }],
    })
    expect(calls.find((c) => c.method === 'del')).toMatchObject({
      args: [['d1', 'd2']],
    })

    // The scan reply is unwrapped from { cursor, keys } back into the
    // ioredis-style [nextCursor, matchedKeys] tuple the adapter consumes.
    expect(scanResult).toEqual(['0', []])
  })
})
