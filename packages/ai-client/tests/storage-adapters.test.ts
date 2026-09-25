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

  it('revives tool-result createdAt values inside message parts', () => {
    restore = installMemoryLocalStorage()
    const record: ChatPersistedState = {
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-result',
              toolCallId: 'c1',
              content: 'ok',
              state: 'complete',
              createdAt: new Date('2026-08-20T00:00:00.000Z'),
            },
          ],
        },
      ],
    }
    localStoragePersistence().setItem('chat-2', record)
    const read = localStoragePersistence().getItem('chat-2')
    if (read == null || read instanceof Promise)
      throw new Error('expected sync record')
    const part = read.messages[0]?.parts[0]
    expect(part?.type === 'tool-result' && part.createdAt).toEqual(
      new Date('2026-08-20T00:00:00.000Z'),
    )
  })

  it('removes invalid createdAt values from messages and tool results', () => {
    restore = installMemoryLocalStorage()
    localStoragePersistence().setItem('chat-invalid', {
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          createdAt: 'not-a-date',
          parts: [
            {
              type: 'tool-result',
              toolCallId: 'c1',
              content: 'ok',
              state: 'complete',
              createdAt: 'also-invalid',
            },
          ],
        },
      ],
    } as unknown as ChatPersistedState)
    const result = localStoragePersistence().getItem('chat-invalid')
    if (result == null || result instanceof Promise)
      throw new Error('expected sync record')
    const read = result
    expect(read.messages[0]).not.toHaveProperty('createdAt')
    expect(read.messages[0]?.parts[0]).not.toHaveProperty('createdAt')
  })

  it('preserves createdAt fields inside stored metadata', () => {
    restore = installMemoryLocalStorage()
    const metadata = {
      createdAt: 'message-metadata',
      tanstack: { createdAt: '2026-08-20T00:00:00.000Z' },
      nested: { createdAt: 'nested-metadata' },
    }
    const partMetadata = { createdAt: 'part-metadata' }
    localStoragePersistence().setItem(
      'chat-metadata',
      JSON.parse(
        JSON.stringify({
          messages: [
            {
              id: 'a1',
              role: 'assistant',
              parts: [{ type: 'text', content: 'ok', metadata: partMetadata }],
              metadata,
            },
          ],
        }),
      ),
    )

    const result = localStoragePersistence().getItem('chat-metadata')
    if (result == null || result instanceof Promise)
      throw new Error('expected sync record')
    expect(result.messages[0]?.metadata).toEqual(metadata)
    expect(result.messages[0]?.parts[0]).toHaveProperty(
      'metadata',
      partMetadata,
    )
  })
})
