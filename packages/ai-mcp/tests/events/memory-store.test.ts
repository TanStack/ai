import { describe, expect, it } from 'vitest'
import { createMCPEventSecret } from '../../src/events/secret'
import { inMemoryMCPEventStore } from '../../src/events/memory-store'
import type { MCPEventSubscription } from '../../src/events/types'

function record(
  patch: Partial<MCPEventSubscription> = {},
): MCPEventSubscription {
  return {
    key: 'key-1',
    name: 'incident.created',
    arguments: {},
    definition: {
      name: 'incident.created',
      delivery: ['webhook'],
      inputSchema: {},
      payloadSchema: true,
    },
    delivery: {
      mode: 'webhook',
      url: 'https://hooks.example.test/mcp?mcp_event_subscription=key-1',
      secret: createMCPEventSecret(),
    },
    cursor: 'c0',
    truncated: false,
    status: 'pending',
    ...patch,
  }
}

describe('inMemoryMCPEventStore', () => {
  it('set then get returns an equal value that is not the same object', async () => {
    const store = inMemoryMCPEventStore()
    const saved = record()
    await store.set(saved)
    const got = await store.get('key-1')
    expect(got).toEqual(saved)
    expect(got).not.toBe(saved)
  })

  it('getById finds a record after update(key,{id})', async () => {
    const store = inMemoryMCPEventStore()
    await store.set(record())
    await store.update('key-1', { id: 'sub-9' })
    const got = await store.getById('sub-9')
    expect(got?.key).toBe('key-1')
    expect(got?.id).toBe('sub-9')
  })

  it('update merges only the given fields', async () => {
    const store = inMemoryMCPEventStore()
    const saved = record()
    await store.set(saved)
    await store.update('key-1', { cursor: 'c1' })
    const got = await store.get('key-1')
    expect(got?.cursor).toBe('c1')
    expect(got?.delivery.secret).toBe(saved.delivery.secret)
  })

  it('update on an unknown key is a no-op', async () => {
    const store = inMemoryMCPEventStore()
    await store.update('missing', { cursor: 'nope' })
    expect(await store.get('missing')).toBeUndefined()
  })

  it('delete removes the record from both get and getById', async () => {
    const store = inMemoryMCPEventStore()
    await store.set(record({ id: 'sub-1' }))
    await store.delete('key-1')
    expect(await store.get('key-1')).toBeUndefined()
    expect(await store.getById('sub-1')).toBeUndefined()
  })

  it('mutating a returned record does not change the stored one', async () => {
    const store = inMemoryMCPEventStore()
    await store.set(record({ id: 'sub-1' }))
    const got = await store.get('key-1')
    got!.cursor = 'mutated'
    expect((await store.get('key-1'))?.cursor).toBe('c0')
  })

  it('list yields structured clones of every record', async () => {
    const store = inMemoryMCPEventStore()
    await store.set(record({ key: 'a', id: 'id-a' }))
    await store.set(record({ key: 'b', id: 'id-b', cursor: 'c2' }))
    const listed: Array<MCPEventSubscription> = []
    for await (const item of store.list!()) listed.push(item)
    expect(listed.map((item) => item.key).sort()).toEqual(['a', 'b'])
    listed[0]!.cursor = 'mutated'
    expect((await store.get(listed[0]!.key))?.cursor).not.toBe('mutated')
  })
})
