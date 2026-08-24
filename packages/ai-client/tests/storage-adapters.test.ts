import { afterEach, describe, expect, it } from 'vitest'
import { localStoragePersistence } from '../src/storage-adapters'
import type { ChatPersistedState } from '../src/types'

function installMemoryLocalStorage() {
  const map = new Map<string, string>()
  const stub: Storage = {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key) {
      return map.get(key) ?? null
    },
    key(index) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key) {
      map.delete(key)
    },
    setItem(key, value) {
      map.set(key, value)
    },
  }
  const globals = globalThis as typeof globalThis & { localStorage?: Storage }
  const previous = globals.localStorage
  globals.localStorage = stub
  return () => {
    globals.localStorage = previous
  }
}

describe('localStoragePersistence createdAt revival', () => {
  let restore: (() => void) | undefined

  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('revives a JSON-string createdAt back into a Date', () => {
    restore = installMemoryLocalStorage()
    const createdAt = new Date('2026-08-20T00:00:00.000Z')
    const store = localStoragePersistence()
    const record: ChatPersistedState = {
      messages: [
        {
          id: 'u1',
          role: 'user',
          parts: [{ type: 'text', content: 'hi' }],
          createdAt,
        },
      ],
    }

    store.setItem('chat-1', record)
    const raw = globalThis.localStorage?.getItem('tanstack-ai:chat-1')
    expect(raw).toContain('"createdAt":"2026-08-20T00:00:00.000Z"')

    const read = store.getItem('chat-1')
    expect(read).not.toBeNull()
    if (read == null || read instanceof Promise) {
      throw new Error('expected a sync persisted record')
    }
    expect(read.messages[0]?.createdAt).toEqual(createdAt)
    expect(read.messages[0]?.createdAt).toBeInstanceOf(Date)
  })
})
