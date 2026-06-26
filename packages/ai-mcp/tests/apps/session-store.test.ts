import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryMcpSessionStore } from '../../src/apps/session-store'

describe('inMemoryMcpSessionStore', () => {
  it('stores and resolves a descriptor by thread + serverId', async () => {
    const store = inMemoryMcpSessionStore()
    await store.set('t1', {
      weather: { transport: { type: 'http', url: 'https://x/mcp' } },
    })
    expect(await store.get('t1', 'weather')).toEqual({
      transport: { type: 'http', url: 'https://x/mcp' },
    })
    expect(await store.get('t1', 'nope')).toBeNull()
    expect(await store.get('other', 'weather')).toBeNull()
  })

  it('defaults to the sole server when serverId is undefined', async () => {
    const store = inMemoryMcpSessionStore()
    await store.set('t1', {
      weather: { transport: { type: 'http', url: 'https://x/mcp' } },
    })
    expect(await store.get('t1', undefined)).toEqual({
      transport: { type: 'http', url: 'https://x/mcp' },
    })
  })

  it('returns null for undefined serverId when multiple servers exist', async () => {
    const store = inMemoryMcpSessionStore()
    await store.set('t1', {
      a: { transport: { type: 'http', url: 'https://a/mcp' } },
      b: { transport: { type: 'http', url: 'https://b/mcp' } },
    })
    expect(await store.get('t1', undefined)).toBeNull()
  })

  describe('TTL', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns null and prunes entry when TTL has expired', async () => {
      const store = inMemoryMcpSessionStore({ ttlMs: 1000 })
      await store.set('t2', {
        srv: { transport: { type: 'http', url: 'https://y/mcp' } },
      })
      vi.advanceTimersByTime(1001)
      expect(await store.get('t2', 'srv')).toBeNull()
    })

    it('sweeps expired entries on set() while preserving live + fresh ones', async () => {
      const store = inMemoryMcpSessionStore({ ttlMs: 1000 })
      // Two threads recorded but never read (the set-but-never-read case the
      // sweep targets).
      await store.set('stale1', {
        srv: { transport: { type: 'http', url: 'https://1/mcp' } },
      })
      await store.set('stale2', {
        srv: { transport: { type: 'http', url: 'https://2/mcp' } },
      })
      // Let them lapse, then a fresh set() triggers the opportunistic sweep.
      vi.advanceTimersByTime(1001)
      await store.set('fresh', {
        srv: { transport: { type: 'http', url: 'https://3/mcp' } },
      })
      // The expired threads are gone and the just-written one is retrievable —
      // set() stays correct across the sweep.
      expect(await store.get('stale1', 'srv')).toBeNull()
      expect(await store.get('stale2', 'srv')).toBeNull()
      expect(await store.get('fresh', 'srv')).toEqual({
        transport: { type: 'http', url: 'https://3/mcp' },
      })
    })

    it('slides the TTL on a successful get within the window', async () => {
      const store = inMemoryMcpSessionStore({ ttlMs: 1000 })
      await store.set('t2', {
        srv: { transport: { type: 'http', url: 'https://y/mcp' } },
      })
      // Get just within the window — refreshes expiry to now.
      vi.advanceTimersByTime(900)
      expect(await store.get('t2', 'srv')).not.toBeNull()
      // Another 900ms: would have expired by absolute time (1800 > 1000) but
      // the sliding refresh keeps it alive (only 900ms since last hit).
      vi.advanceTimersByTime(900)
      expect(await store.get('t2', 'srv')).not.toBeNull()
      // Now let it lapse past the window with no access.
      vi.advanceTimersByTime(1001)
      expect(await store.get('t2', 'srv')).toBeNull()
    })
  })

  it('overwrites existing entries for the same threadId', async () => {
    const store = inMemoryMcpSessionStore()
    await store.set('t3', {
      a: { transport: { type: 'http', url: 'https://a/mcp' } },
    })
    await store.set('t3', {
      b: { transport: { type: 'http', url: 'https://b/mcp' } },
    })
    expect(await store.get('t3', 'a')).toBeNull()
    expect(await store.get('t3', 'b')).toEqual({
      transport: { type: 'http', url: 'https://b/mcp' },
    })
  })
})
