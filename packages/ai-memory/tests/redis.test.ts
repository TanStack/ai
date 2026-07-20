// @ts-expect-error -- ioredis-mock has no bundled types and we don't need them
//   here; the contract test only exercises the RedisLike subset that
//   redisMemoryAdapter consumes (cast to `never` below).
import RedisMock from 'ioredis-mock'
import { describe, expect, it, vi } from 'vitest'
import { nodeRedisAsRedisLike, redisMemoryAdapter } from '../src/adapters/redis'
import { runMemoryAdapterContract } from './contract'

runMemoryAdapterContract('redisMemoryAdapter', async () => {
  const client = new RedisMock()
  return redisMemoryAdapter({
    redis: client as never,
    prefix: `test:${crypto.randomUUID()}`,
  })
})

describe('redisMemoryAdapter malformed rows', () => {
  it('skips a malformed record on read but does NOT delete it', async () => {
    const prefix = `test:${crypto.randomUUID()}`
    const client = new RedisMock()
    const adapter = redisMemoryAdapter({ redis: client as never, prefix })
    const scope = { tenantId: 't1', userId: 'u1' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await adapter.add({
        id: 'good',
        scope,
        text: 'ok',
        kind: 'fact',
        createdAt: Date.now(),
      })
      await adapter.add({
        id: 'bad',
        scope,
        text: 'will be corrupted',
        kind: 'fact',
        createdAt: Date.now(),
      })
      // Corrupt the stored payload directly, simulating a truncated write or a
      // third-party writer using an incompatible schema.
      const badKey = `${prefix}:record:bad`
      await client.set(badKey, '{ not valid json')

      // The malformed row is skipped, the good one still returned.
      const listed = await adapter.list(scope)
      const ids = listed.items.map((r) => r.id)
      expect(ids).toContain('good')
      expect(ids).not.toContain('bad')

      // Load-bearing: the malformed row is LEFT IN PLACE, not deleted — a
      // parse failure is not proof the data is unrecoverable.
      expect(await client.get(badKey)).toBe('{ not valid json')
      // And the developer was warned about it.
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
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
        cursor: number | string,
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

    // Cursor passthrough — node-redis v5 uses string cursors and v4 uses
    // number cursors. The wrapper must thread either through unchanged so
    // a string cursor past Number.MAX_SAFE_INTEGER round-trips losslessly.
    await wrapped.scan('0', 'MATCH', 'p:*')
    await wrapped.scan(0, 'MATCH', 'p:*')
    const bigCursor = '90071992547409930' // > Number.MAX_SAFE_INTEGER
    await wrapped.scan(bigCursor, 'MATCH', 'p:*')
    // COUNT <= 0 must be silently dropped — Redis rejects COUNT 0.
    await wrapped.scan(0, 'MATCH', 'p:*', 'COUNT', '0')

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
    const scanCalls = calls.filter((c) => c.method === 'scan')
    // First scan: numeric COUNT translated correctly; cursor '0' threaded as-is
    // (no Number() coercion).
    expect(scanCalls[0]).toMatchObject({
      args: ['0', { MATCH: 'pattern:*', COUNT: 50 }],
    })
    // String cursor passed through as a string (v5 shape).
    expect(scanCalls[1]?.args[0]).toBe('0')
    // Number cursor passed through as a number (v4 shape).
    expect(scanCalls[2]?.args[0]).toBe(0)
    // Big string cursor past Number.MAX_SAFE_INTEGER round-trips losslessly.
    expect(scanCalls[3]?.args[0]).toBe('90071992547409930')
    // COUNT 0 is silently dropped (Redis rejects COUNT <= 0).
    expect(scanCalls[4]?.args[1]).toEqual({ MATCH: 'p:*' })
    expect(calls.find((c) => c.method === 'del')).toMatchObject({
      args: [['d1', 'd2']],
    })

    // The scan reply is unwrapped from { cursor, keys } back into the
    // ioredis-style [nextCursor, matchedKeys] tuple the adapter consumes.
    expect(scanResult).toEqual(['0', []])
  })
})
