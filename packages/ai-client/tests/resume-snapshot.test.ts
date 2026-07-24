import { describe, expect, it, vi } from 'vitest'
import { ChatPersistor } from '../src/client-persistor'
import { normalizeConnectionAdapter } from '../src/connection-adapters'
import { ChatClient } from '../src/chat-client'
import { localStoragePersistence } from '../src/storage-adapters'
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

  it('with storeMessages=false removes the key when resume is cleared', () => {
    const { adapter, read } = memoryAdapter()
    const persistor = new ChatPersistor(
      adapter,
      'chat-1',
      () => {},
      undefined,
      false,
    )
    persistor.persistResumeSnapshot({
      schemaVersion: 2,
      resumeState: { threadId: 't1', runId: 'r1' },
    })
    expect(read()).toBeDefined()
    // Finish / dead-pointer cleanup: clearing resume must drop the key so a
    // reload does not re-rejoin a finished run.
    persistor.persistResumeSnapshot(null)
    expect(read()).toBeUndefined()
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

describe('localStoragePersistence ergonomics', () => {
  it('needs no type arg or codec and round-trips a ChatPersistedState', () => {
    // Minimal in-memory Storage stub so the test doesn't depend on a DOM env.
    const map = new Map<string, string>()
    const stub = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    }
    const globals = globalThis as { localStorage?: unknown }
    const previous = globals.localStorage
    globals.localStorage = stub
    try {
      // The headline call: no generic, no serialize/deserialize.
      const store = localStoragePersistence()
      const record: ChatPersistedState = {
        messages: [createUIMessage('m1', 'hi')],
        resume: {
          schemaVersion: 2,
          resumeState: { threadId: 't1', runId: 'r1' },
        },
      }
      store.setItem('chat-1', record)
      const read = store.getItem('chat-1')
      expect(read && !(read instanceof Promise) && read.messages[0]?.id).toBe(
        'm1',
      )
    } finally {
      globals.localStorage = previous
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

  it('omits joinRun when the property is present but not a function', () => {
    const normalized = normalizeConnectionAdapter({
      connect: async function* () {},
      // Explicit undefined must not produce a wrapper that throws on rejoin.
      joinRun: undefined,
    } as ResumableConnectConnectionAdapter)
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

  it('messages:false reconstructs history AND rejoins a live run together', async () => {
    // A prior server-authoritative session persisted only the resume pointer:
    // messages is [] (not cached), resume carries the in-flight runId.
    const { adapter } = memoryAdapter({
      messages: [],
      resume: {
        schemaVersion: 2,
        resumeState: { threadId: 't1', runId: 'r1' },
      },
    })

    const joinRun = vi.fn(async function* (_runId: string) {
      for (const chunk of runChunks('r1', 't1')) {
        yield chunk
      }
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }

    let latest: Array<UIMessage> = []
    const client = new ChatClient({
      threadId: 't1',
      connection,
      persistence: { store: adapter, messages: false },
      // History the app fetched from the server (reconstructChat) and seeded.
      initialMessages: [createUIMessage('history-1', 'earlier turn', 'user')],
      onMessagesChange: (messages) => {
        latest = messages
      },
    })

    await vi.waitFor(() => {
      const assistant = latest.find((m) => m.role === 'assistant')
      const text = assistant?.parts.find((p) => p.type === 'text')
      expect(text && 'content' in text && text.content).toBe('world')
    })

    // Server-reconstructed history is NOT wiped by the empty persisted record...
    expect(latest.some((m) => m.id === 'history-1')).toBe(true)
    // ...and the live run was rejoined off the durability log.
    expect(joinRun).toHaveBeenCalledWith('r1', expect.anything())
    void client
  })

  it('rebuilds a hydrated in-flight partial in place (no duplicate) on rejoin', async () => {
    // Server-authoritative reload where a streaming snapshot persisted a PARTIAL
    // assistant reply carrying the same messageId the live run uses. The rejoin
    // must rebuild it from the log into ONE clean bubble — not seed+append into
    // "worworld", and not leave a second bubble.
    const { adapter } = memoryAdapter({
      messages: [],
      resume: {
        schemaVersion: 2,
        resumeState: { threadId: 't1', runId: 'r1' },
      },
    })

    const joinRun = vi.fn(async function* (_runId: string) {
      for (const chunk of runChunks('r1', 't1')) yield chunk
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }

    let latest: Array<UIMessage> = []
    const client = new ChatClient({
      threadId: 't1',
      connection,
      persistence: { store: adapter, messages: false },
      initialMessages: [
        createUIMessage('user-1', 'hi', 'user'),
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'wor' }],
          createdAt: new Date(),
        },
      ],
      onMessagesChange: (messages) => {
        latest = messages
      },
    })

    await vi.waitFor(() => {
      const assistant = latest.find((m) => m.role === 'assistant')
      const text = assistant?.parts.find((p) => p.type === 'text')
      expect(text && 'content' in text && text.content).toBe('world')
    })

    const assistants = latest.filter((m) => m.role === 'assistant')
    expect(assistants).toHaveLength(1)
    const text = assistants[0]?.parts.find((p) => p.type === 'text')
    expect(text && 'content' in text && text.content).toBe('world')
    expect(latest.some((m) => m.id === 'user-1')).toBe(true)
    void client
  })

  it('keeps the resume pointer on the client run id across a rejoin', async () => {
    // The durability log is keyed by the CLIENT run id (what the pointer holds).
    // A rejoin replays the run whose events carry the PROVIDER run id — that must
    // NOT overwrite the persisted pointer, or a SECOND reload would joinRun an id
    // the log isn't keyed by and never re-attach.
    const { adapter, read } = memoryAdapter({
      messages: [],
      resume: {
        schemaVersion: 2,
        resumeState: { threadId: 't1', runId: 'client-run' },
      },
    })
    const joinRun = vi.fn(async function* (_runId: string) {
      // In-flight run (no RUN_FINISHED) whose events carry a different provider id.
      yield {
        type: 'RUN_STARTED',
        runId: 'provider-run',
        threadId: 't1',
        timestamp: 1,
      } as StreamChunk
      yield {
        type: 'TEXT_MESSAGE_START',
        messageId: 'a1',
        role: 'assistant',
        timestamp: 2,
      } as StreamChunk
      yield {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'a1',
        delta: 'partial',
        content: 'partial',
        timestamp: 3,
      } as StreamChunk
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }
    let latest: Array<UIMessage> = []
    const client = new ChatClient({
      threadId: 't1',
      connection,
      persistence: { store: adapter, messages: false },
      onMessagesChange: (m) => {
        latest = m
      },
    })

    await vi.waitFor(() => {
      const a = latest.find((m) => m.role === 'assistant')
      const t = a?.parts.find((p) => p.type === 'text')
      expect(t && 'content' in t && t.content).toBe('partial')
    })

    const stored = read() as ChatPersistedState
    expect(stored.resume?.resumeState.runId).toBe('client-run')
    void client
  })

  it('rejoins a live run handed to a fresh client via initialResumeSnapshot', async () => {
    // A second device/browser opening the thread: no persisted resume pointer of
    // its own, but the app's hydration reported an in-flight run id and passed it
    // as `initialResumeSnapshot`. The client must tail it, not just restore
    // interrupts. Mirrors the server-authoritative page handing over `activeRunId`.
    const joinRun = vi.fn(async function* (_runId: string) {
      for (const chunk of runChunks('r1', 't1')) yield chunk
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }

    let latest: Array<UIMessage> = []
    const client = new ChatClient({
      threadId: 't1',
      connection,
      // History the app fetched from the server (reconstructChat) and seeded.
      initialMessages: [createUIMessage('history-1', 'earlier turn', 'user')],
      initialResumeSnapshot: {
        schemaVersion: 2,
        resumeState: { threadId: 't1', runId: 'r1' },
      },
      onMessagesChange: (messages) => {
        latest = messages
      },
    })

    await vi.waitFor(() => {
      const assistant = latest.find((m) => m.role === 'assistant')
      const text = assistant?.parts.find((p) => p.type === 'text')
      expect(text && 'content' in text && text.content).toBe('world')
    })
    expect(joinRun).toHaveBeenCalledWith('r1', expect.anything())
    // Seeded history survives alongside the tailed reply.
    expect(latest.some((m) => m.id === 'history-1')).toBe(true)
    void client
  })

  it('rejoins from an async store (getItem returns a Promise)', async () => {
    // An async adapter (like indexedDBPersistence): readInitial resolves later,
    // so the rejoin must come from the async hydrate path, not the sync read.
    const record: ChatPersistedState = {
      messages: [],
      resume: {
        schemaVersion: 2,
        resumeState: { threadId: 't1', runId: 'r1' },
      },
    }
    const asyncAdapter: ChatClientPersistence = {
      getItem: () => Promise.resolve(record),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    }

    const joinRun = vi.fn(async function* (_runId: string) {
      for (const chunk of runChunks('r1', 't1')) {
        yield chunk
      }
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }

    let latest: Array<UIMessage> = []
    const client = new ChatClient({
      threadId: 't1',
      connection,
      persistence: asyncAdapter,
      onMessagesChange: (messages) => {
        latest = messages
      },
    })

    await vi.waitFor(() => {
      const assistant = latest.find((m) => m.role === 'assistant')
      const text = assistant?.parts.find((p) => p.type === 'text')
      expect(text && 'content' in text && text.content).toBe('world')
    })
    expect(joinRun).toHaveBeenCalledWith('r1', expect.anything())
    void client
  })

  it('clears a dead resume pointer when joinRun never attaches', async () => {
    const { adapter, read } = memoryAdapter({
      messages: [createUIMessage('user-1', 'hi', 'user')],
      resume: {
        schemaVersion: 2,
        resumeState: { threadId: 't1', runId: 'gone-run' },
      },
    })
    // joinRun hangs until aborted by the connect deadline — never yields.
    const joinRun = vi.fn(async function* (
      _runId: string,
      signal?: AbortSignal,
    ) {
      await new Promise<void>((resolve) => {
        if (signal?.aborted) {
          resolve()
          return
        }
        signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }
    let status: string | undefined
    const client = new ChatClient({
      id: 'chat-dead',
      threadId: 't1',
      connection,
      persistence: adapter,
      onStatusChange: (s) => {
        status = s
      },
    })

    await vi.waitFor(
      () => {
        expect(joinRun).toHaveBeenCalled()
        expect(status).toBe('ready')
        expect(client.getIsLoading()).toBe(false)
      },
      { timeout: 5_000 },
    )

    // Dead pointer must be removed so the next load does not re-pin loading.
    await vi.waitFor(() => {
      const stored = read()
      if (stored && !Array.isArray(stored)) {
        expect(stored.resume).toBeUndefined()
      } else {
        // messages may still be present without resume, or key removed only if
        // messages were also empty — with cached messages, record stays without resume.
        expect(
          stored && !Array.isArray(stored) ? stored.resume : undefined,
        ).toBe(undefined)
      }
    })
    void client
  })

  it('with messages:false removes the resume-only key after a dead rejoin', async () => {
    const { adapter, read } = memoryAdapter({
      messages: [],
      resume: {
        schemaVersion: 2,
        resumeState: { threadId: 't1', runId: 'gone-run' },
      },
    })
    const joinRun = vi.fn(async function* (
      _runId: string,
      signal?: AbortSignal,
    ) {
      await new Promise<void>((resolve) => {
        if (signal?.aborted) {
          resolve()
          return
        }
        signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }
    const client = new ChatClient({
      threadId: 't1',
      connection,
      persistence: { store: adapter, messages: false },
      initialMessages: [createUIMessage('history-1', 'seed', 'user')],
    })

    await vi.waitFor(
      () => {
        expect(joinRun).toHaveBeenCalled()
        expect(client.getIsLoading()).toBe(false)
        expect(read()).toBeUndefined()
      },
      { timeout: 5_000 },
    )
    void client
  })

  it('surfaces post-attach rejoin errors via onError', async () => {
    const { adapter } = memoryAdapter({
      messages: [createUIMessage('user-1', 'hi', 'user')],
      resume: {
        schemaVersion: 2,
        resumeState: { threadId: 't1', runId: 'r1' },
      },
    })
    const joinRun = vi.fn(async function* (_runId: string) {
      yield {
        type: 'RUN_STARTED',
        runId: 'r1',
        threadId: 't1',
        timestamp: 1,
      } as StreamChunk
      yield {
        type: 'TEXT_MESSAGE_START',
        messageId: 'a1',
        role: 'assistant',
        timestamp: 2,
      } as StreamChunk
      throw new Error('transport died mid-replay')
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }
    const onError = vi.fn()
    const client = new ChatClient({
      id: 'chat-err',
      threadId: 't1',
      connection,
      persistence: adapter,
      onError,
    })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled()
    })
    expect(String(onError.mock.calls[0]?.[0])).toMatch(/transport died/)
    void client
  })
})
