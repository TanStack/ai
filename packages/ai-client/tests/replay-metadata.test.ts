import { afterEach, describe, expect, it, vi } from 'vitest'
import { localStoragePersistence } from '../src/storage-adapters'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter } from './test-utils'
import type { ChatPersistedState } from '../src/types'

afterEach(() => vi.unstubAllGlobals())

describe('saved replay metadata', () => {
  it('keeps source, failed-turn and response metadata through JSON storage and hydration', async () => {
    const values = new Map<string, string>()
    const storage: Storage = {
      get length() {
        return values.size
      },
      clear() {
        values.clear()
      },
      getItem(key) {
        return values.get(key) ?? null
      },
      key(index) {
        return [...values.keys()][index] ?? null
      },
      removeItem(key) {
        values.delete(key)
      },
      setItem(key, value) {
        values.set(key, value)
      },
    }
    vi.stubGlobal('localStorage', storage)
    const persistence = localStoragePersistence()
    const state: ChatPersistedState = {
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'partial' }],
          createdAt: new Date('2026-10-03T12:00:00Z'),
          metadata: {
            app: 'value',
            tanstack: {
              source: { provider: 'custom', api: 'chat', model: 'requested' },
              responseId: 'response-1',
              model: 'resolved',
              stopReason: 'aborted',
              promptCache: { key: 'cache' },
              run: { id: 'run-1' },
            },
          },
        },
      ],
    }
    await persistence.setItem('chat-1', state)
    const loaded = await persistence.getItem('chat-1')
    expect(loaded?.messages[0]?.metadata).toEqual({
      app: 'value',
      tanstack: {
        source: { provider: 'custom', api: 'chat', model: 'requested' },
        responseId: 'response-1',
        model: 'resolved',
        stopReason: 'aborted',
        promptCache: { key: 'cache' },
        run: { id: 'run-1' },
      },
    })
    const client = new ChatClient({
      threadId: 'chat-1',
      connection: createMockConnectionAdapter(),
      persistence,
    })
    expect(client.getMessages()[0]?.metadata).toEqual(
      loaded?.messages[0]?.metadata,
    )
    expect(client.getMessages()[0]?.createdAt).toEqual(
      new Date('2026-10-03T12:00:00Z'),
    )
    client.stop()
    expect(client.getMessages()[0]?.metadata?.tanstack?.stopReason).toBe(
      'aborted',
    )
  })

  it('does not invent a server abort when the client stops', () => {
    const client = new ChatClient({
      connection: createMockConnectionAdapter(),
      initialMessages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'partial' }],
          metadata: {
            tanstack: {
              source: { provider: 'custom', api: 'chat', model: 'requested' },
            },
          },
        },
      ],
    })
    client.stop()
    expect(
      client.getMessages()[0]?.metadata?.tanstack?.stopReason,
    ).toBeUndefined()
    expect(
      client.getMessages()[0]?.metadata?.tanstack?.responseId,
    ).toBeUndefined()
  })
})
