import { describe, expect, it } from 'vitest'
import { inMemoryMcpSessionStore } from '../../src/apps/session-store'

describe('inMemoryMcpSessionStore', () => {
  it('stores and resolves a descriptor by thread + serverId', async () => {
    const store = inMemoryMcpSessionStore()
    await store.set('t1', { weather: { transport: { type: 'http', url: 'https://x/mcp' } } })
    expect(await store.get('t1', 'weather')).toEqual({ transport: { type: 'http', url: 'https://x/mcp' } })
    expect(await store.get('t1', 'nope')).toBeNull()
    expect(await store.get('other', 'weather')).toBeNull()
  })

  it('returns null and prunes entry when TTL has expired', async () => {
    const store = inMemoryMcpSessionStore({ ttlMs: 1 })
    await store.set('t2', { srv: { transport: { type: 'http', url: 'https://y/mcp' } } })
    // Wait longer than TTL
    await new Promise((r) => setTimeout(r, 10))
    expect(await store.get('t2', 'srv')).toBeNull()
  })

  it('overwrites existing entries for the same threadId', async () => {
    const store = inMemoryMcpSessionStore()
    await store.set('t3', { a: { transport: { type: 'http', url: 'https://a/mcp' } } })
    await store.set('t3', { b: { transport: { type: 'http', url: 'https://b/mcp' } } })
    expect(await store.get('t3', 'a')).toBeNull()
    expect(await store.get('t3', 'b')).toEqual({ transport: { type: 'http', url: 'https://b/mcp' } })
  })
})
