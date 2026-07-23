import { describe, expect, it, vi } from 'vitest'
import { ChatPersistor } from '../src/client-persistor'
import { normalizeConnectionAdapter } from '../src/connection-adapters'
import { ChatClient } from '../src/chat-client'
import { createUIMessage } from './test-utils'
import type {
  ChatClientPersistence,
  ChatPersistedState,
  ChatResumeSnapshot,
  UIMessage,
} from '../src/types'
import type {
  ResumableConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

/** An in-memory store capturing the last combined record written. */
function memoryAdapter(initial?: ChatPersistedState | Array<UIMessage>): {
  adapter: ChatClientPersistence
  read: () => ChatPersistedState | Array<UIMessage> | undefined
} {
  let value = initial
  return {
    adapter: {
      getItem: () => value,
      setItem: (_id, state) => {
        value = state
      },
      removeItem: () => {
        value = undefined
      },
    },
    read: () => value,
  }
}

describe('ChatPersistor combined record', () => {
  it('writes messages and resume snapshot as one record', () => {
    const { adapter, read } = memoryAdapter()
    const persistor = new ChatPersistor(adapter, 'chat-1', () => {})

    persistor.notifyMessagesChanged([createUIMessage('m1', 'hello')])
    const snapshot: ChatResumeSnapshot = {
      schemaVersion: 2,
      resumeState: { threadId: 't1', runId: 'r1' },
    }
    persistor.persistResumeSnapshot(snapshot)

    const stored = read() as ChatPersistedState
    expect(stored.messages).toHaveLength(1)
    expect(stored.resume?.resumeState.runId).toBe('r1')
  })

  it('clears the resume snapshot but keeps messages', () => {
    const { adapter, read } = memoryAdapter()
    const persistor = new ChatPersistor(adapter, 'chat-1', () => {})
    persistor.notifyMessagesChanged([createUIMessage('m1', 'hello')])
    persistor.persistResumeSnapshot({
      schemaVersion: 2,
      resumeState: { threadId: 't1', runId: 'r1' },
    })
    persistor.persistResumeSnapshot(null)

    const stored = read() as ChatPersistedState
    expect(stored.messages).toHaveLength(1)
    expect(stored.resume).toBeUndefined()
  })

  it('normalizes a legacy bare-array record on read', () => {
    const applied: Array<Array<UIMessage>> = []
    const { adapter } = memoryAdapter([createUIMessage('m1', 'legacy')])
    const persistor = new ChatPersistor(adapter, 'chat-1', (m) =>
      applied.push(m),
    )
    const state = persistor.readInitial() as ChatPersistedState
    expect(state.messages[0]?.id).toBe('m1')
    expect(state.resume).toBeUndefined()
  })

  it('with storeMessages=false persists only the resume pointer', () => {
    const { adapter, read } = memoryAdapter()
    // storeMessages=false via the 5th constructor arg.
    const persistor = new ChatPersistor(
      adapter,
      'chat-1',
      () => {},
      undefined,
      false,
    )
    persistor.notifyMessagesChanged([createUIMessage('m1', 'heavy history')])
    persistor.persistResumeSnapshot({
      schemaVersion: 2,
      resumeState: { threadId: 't1', runId: 'r1' },
    })
    const stored = read() as ChatPersistedState
    // Transcript stays off the client; the tiny resume pointer is kept so
    // durability rejoin still works.
    expect(stored.messages).toEqual([])
    expect(stored.resume?.resumeState.runId).toBe('r1')
  })
})

describe('ChatClient persistence option shapes', () => {
  it('accepts { store, messages: false } and keeps messages off the client', () => {
    const { adapter, read } = memoryAdapter()
    const client = new ChatClient({
      id: 'chat-cfg',
      threadId: 't1',
      connection: { connect: async function* () {} },
      persistence: { store: adapter, messages: false },
      initialMessages: [createUIMessage('seed', 'hi', 'user')],
    })
    // A message change should not write the transcript into the record.
    void client
    const stored = read()
    if (stored && !Array.isArray(stored)) {
      expect(stored.messages).toEqual([])
    }
  })
})

describe('normalizeConnectionAdapter joinRun passthrough', () => {
  it('exposes joinRun when the connection is resumable', () => {
    const joinRun = vi.fn(async function* () {
      // empty
    })
    const resumable: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }
    const normalized = normalizeConnectionAdapter(resumable)
    expect(typeof normalized.joinRun).toBe('function')
  })

  it('omits joinRun for a plain connect adapter', () => {
    const normalized = normalizeConnectionAdapter({
      connect: async function* () {},
    })
    expect(normalized.joinRun).toBeUndefined()
  })
})

function runChunks(runId: string, threadId: string): Array<StreamChunk> {
  return [
    { type: 'RUN_STARTED', runId, threadId, timestamp: 1 } as StreamChunk,
    {
      type: 'TEXT_MESSAGE_START',
      messageId: 'assistant-1',
      role: 'assistant',
      timestamp: 2,
    } as StreamChunk,
    {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'assistant-1',
      delta: 'world',
      content: 'world',
      timestamp: 3,
    } as StreamChunk,
    {
      type: 'TEXT_MESSAGE_END',
      messageId: 'assistant-1',
      timestamp: 4,
    } as StreamChunk,
    {
      type: 'RUN_FINISHED',
      runId,
      threadId,
      timestamp: 5,
      finishReason: 'stop',
    } as StreamChunk,
  ]
}

describe('ChatClient auto-rejoin after reload', () => {
  it('rejoins a persisted in-flight run via joinRun', async () => {
    // A store pre-seeded as if a previous session persisted a live run.
    const { adapter } = memoryAdapter({
      messages: [createUIMessage('user-1', 'hi', 'user')],
      resume: {
        schemaVersion: 2,
        resumeState: { threadId: 't1', runId: 'r1' },
      },
    })

    const joinRun = vi.fn(
      // eslint-disable-next-line require-yield
      async function* (_runId: string) {
        for (const chunk of runChunks('r1', 't1')) {
          yield chunk
        }
      },
    )
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* (
        _messages,
        _data?: Record<string, unknown>,
        _signal?: AbortSignal,
        _ctx?: RunAgentInputContext,
      ) {},
      joinRun,
    }

    let latest: Array<UIMessage> = []
    const client = new ChatClient({
      id: 'chat-1',
      threadId: 't1',
      connection,
      persistence: adapter,
      onMessagesChange: (messages) => {
        latest = messages
      },
    })

    // Rejoin is async; wait for the replayed run to finish.
    await vi.waitFor(() => {
      const assistant = latest.find((m) => m.role === 'assistant')
      const text = assistant?.parts.find((p) => p.type === 'text')
      expect(text && 'content' in text && text.content).toBe('world')
    })

    expect(joinRun).toHaveBeenCalledWith('r1', expect.anything())
    // The restored user message survives alongside the rejoined assistant reply.
    expect(latest.some((m) => m.id === 'user-1')).toBe(true)
    void client
  })
})
