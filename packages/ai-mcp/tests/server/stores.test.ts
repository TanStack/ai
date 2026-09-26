import { describe, expect, it } from 'vitest'
import { inMemoryTaskStore } from '../../src/server/stores'

const taskRecord = {
  status: 'working',
  progress: 1,
}

describe('inMemoryTaskStore', () => {
  it('returns the value that set saved', async () => {
    const store = inMemoryTaskStore()
    await store.set('item-1', taskRecord)
    expect(await store.get('item-1')).toEqual(taskRecord)
  })

  it('returns null when the id is missing', async () => {
    const store = inMemoryTaskStore()
    expect(await store.get('missing')).toBeNull()
  })

  it('returns null for a deleted id and keeps the other id', async () => {
    const store = inMemoryTaskStore()
    await store.set('item-1', taskRecord)
    await store.set('item-2', taskRecord)
    await store.delete('item-1')
    expect(await store.get('item-1')).toBeNull()
    expect(await store.get('item-2')).toEqual(taskRecord)
  })

  it('replaces the value when set uses the same id', async () => {
    const store = inMemoryTaskStore()
    await store.set('item-1', taskRecord)
    await store.set('item-1', { replaced: true })
    expect(await store.get('item-1')).toEqual({ replaced: true })
  })

  it('does not share entries with a second call', async () => {
    const first = inMemoryTaskStore()
    const second = inMemoryTaskStore()
    await first.set('item-1', taskRecord)
    expect(await second.get('item-1')).toBeNull()
    expect(await first.get('item-1')).toEqual(taskRecord)
  })
})
