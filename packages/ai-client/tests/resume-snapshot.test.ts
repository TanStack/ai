import { describe, expect, it, vi } from 'vitest'
import { INTERRUPT_BINDING_VERSION } from '@tanstack/ai/client'
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

/**
 * Construct a client and ATTACH it — what a framework wrapper does when its view
 * mounts.
 *
 * Tailing deliberately no longer starts in the constructor. A UI framework may
 * build a client and throw it away (React does on a double-invoked render), and a
 * discarded instance is never mounted, so nothing would ever close a connection it
 * had opened. See `ChatClient.attach`.
 */
function mountedChatClient(
  options: ConstructorParameters<typeof ChatClient>[0],
): ChatClient {
  const client = new ChatClient(options)
  client.attach()
  return client
}

describe('ChatPersistor combined record', () => {
  it('writes messages and resume snapshot as one record', () => {
    const { adapter, read } = memoryAdapter()
    const persistor = new ChatPersistor(adapter, 'chat-1', () => {})

    persistor.notifyMessagesChanged([createUIMessage('m1', 'hello')])
    const snapshot: ChatResumeSnapshot = {
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
    // Explicit undefined must not produce a wrapper that throws on rejoin.
    // Object.assign sidesteps the literal excess-property check to model a JS
    // caller passing `joinRun: undefined` against the typed interface.
    const normalized = normalizeConnectionAdapter(
      Object.assign({ connect: async function* () {} }, { joinRun: undefined }),
    )
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
    const client = mountedChatClient({
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

  it('persistence:true hydrates history AND tails a live run from the server on mount', async () => {
    // Server-authoritative: the client caches no transcript and no run pointer.
    // On mount it calls connection.hydrate(threadId), which returns the stored
    // transcript plus a cursor to the in-flight run â€” the client paints the
    // history and tails the run via joinRun. No loader, no seeded pointer.

    const joinRun = vi.fn(async function* (_runId: string) {
      for (const chunk of runChunks('r1', 't1')) {
        yield chunk
      }
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: () =>
        Promise.resolve({
          messages: [createUIMessage('history-1', 'earlier turn', 'user')],
          activeRun: { runId: 'r1' },
          interrupts: null,
        }),
    }

    let latest: Array<UIMessage> = []
    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
      onMessagesChange: (messages) => {
        latest = messages
      },
    })

    await vi.waitFor(() => {
      const assistant = latest.find((m) => m.role === 'assistant')
      const text = assistant?.parts.find((p) => p.type === 'text')
      expect(text && 'content' in text && text.content).toBe('world')
    })

    // Server-hydrated history is painted...
    expect(latest.some((m) => m.id === 'history-1')).toBe(true)
    // ...and the live run was tailed off the durability log, addressed by the
    // server-resolved run id (the client only ever supplied the threadId).
    expect(joinRun).toHaveBeenCalledWith('r1', expect.anything())
    void client
  })

  it('persistence:true hydrates a transcript with no active run (no tail)', async () => {
    const joinRun = vi.fn(async function* () {})
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: () =>
        Promise.resolve({
          messages: [
            createUIMessage('u1', 'hi', 'user'),
            createUIMessage('a1', 'done', 'assistant'),
          ],
          activeRun: null,
          interrupts: null,
        }),
    }
    let latest: Array<UIMessage> = []
    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
      onMessagesChange: (messages) => {
        latest = messages
      },
    })
    await vi.waitFor(() => {
      expect(latest.some((m) => m.id === 'a1')).toBe(true)
    })
    // No active run â†’ the transcript is painted and nothing is tailed.
    expect(joinRun).not.toHaveBeenCalled()
    void client
  })

  it('persistence:true restores a pending interrupt from the server on mount', async () => {
    // Regression: a run paused on an interrupt is not "running", so there is no
    // tail â€” but a reload must still re-prompt the approval. The client restores
    // it from the server hydrate result (not client storage), so a fresh client
    // (or another device) shows a resolvable interrupt keyed to the run it paused.
    const joinRun = vi.fn(async function* () {})
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: () =>
        Promise.resolve({
          messages: [createUIMessage('u1', 'send an email', 'user')],
          activeRun: null,
          interrupts: {
            runId: 'run-paused',
            pending: [
              {
                id: 'int-1',
                reason: 'confirmation',
                metadata: {
                  'tanstack:interruptBinding': {
                    v: INTERRUPT_BINDING_VERSION,
                    kind: 'generic',
                    interruptId: 'int-1',
                    interruptedRunId: 'run-paused',
                    generation: 1,
                    responseSchemaHash: 'none',
                  },
                },
              },
            ],
          },
        }),
    }
    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })
    await vi.waitFor(() => {
      expect(client.getInterrupts()).toHaveLength(1)
    })
    const [item] = client.getInterrupts()
    expect(item?.kind).toBe('generic')
    // Restored bound and resolvable, keyed to the run it paused â€” not tailed.
    expect(item?.canResolve).toBe(true)
    expect(item?.interruptedRunId).toBe('run-paused')
    expect(joinRun).not.toHaveBeenCalled()
  })

  it('restores a pending interrupt even when hydrate also reports an activeRun', async () => {
    // A run paused on an interrupt can momentarily still read as `running` on the
    // server (the status settles just after the interrupt is persisted), so a
    // hydrate that races that window returns BOTH an `activeRun` cursor and the
    // pending interrupt. A pending interrupt means the thread is paused, so the
    // client must restore the approval and must NOT tail the "active" run (there
    // is nothing to stream until the human resolves it). Regression: the earlier
    // if/else-if tailed the run and dropped the interrupt, so the approval card
    // vanished on reload whenever this race hit.
    const joinRun = vi.fn(async function* () {})
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: () =>
        Promise.resolve({
          messages: [createUIMessage('u1', 'send an email', 'user')],
          activeRun: { runId: 'run-paused' },
          interrupts: {
            runId: 'run-paused',
            pending: [
              {
                id: 'int-1',
                reason: 'confirmation',
                metadata: {
                  'tanstack:interruptBinding': {
                    v: INTERRUPT_BINDING_VERSION,
                    kind: 'generic',
                    interruptId: 'int-1',
                    interruptedRunId: 'run-paused',
                    generation: 1,
                    responseSchemaHash: 'none',
                  },
                },
              },
            ],
          },
        }),
    }
    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })
    await vi.waitFor(() => {
      expect(client.getInterrupts()).toHaveLength(1)
    })
    expect(client.getInterrupts()[0]?.canResolve).toBe(true)
    // Paused run is never tailed, even though hydrate reported it active.
    expect(joinRun).not.toHaveBeenCalled()
  })

  it('rebuilds a hydrated in-flight partial in place (no duplicate) when tailing on mount', async () => {
    // The hydrated transcript includes a PARTIAL assistant reply (a streaming
    // snapshot) carrying the same messageId the live run uses. Tailing it on
    // mount must rebuild that bubble from the log into ONE clean message â€” not
    // seed+append into "worworld", and not leave a second bubble.

    const joinRun = vi.fn(async function* (_runId: string) {
      for (const chunk of runChunks('r1', 't1')) yield chunk
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: () =>
        Promise.resolve({
          messages: [
            createUIMessage('user-1', 'hi', 'user'),
            {
              id: 'assistant-1',
              role: 'assistant',
              parts: [{ type: 'text', content: 'wor' }],
              createdAt: new Date(),
            },
          ],
          activeRun: { runId: 'r1' },
          interrupts: null,
        }),
    }

    let latest: Array<UIMessage> = []
    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
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
    const client = mountedChatClient({
      threadId: 't1',
      connection,
      // History the app fetched from the server (reconstructChat) and seeded.
      initialMessages: [createUIMessage('history-1', 'earlier turn', 'user')],
      initialResumeSnapshot: {
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
    const client = mountedChatClient({
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

  it('KEEPS the resume pointer when joinRun times out before attaching', async () => {
    const { adapter, read } = memoryAdapter({
      messages: [createUIMessage('user-1', 'hi', 'user')],
      resume: {
        resumeState: { threadId: 't1', runId: 'quiet-run' },
      },
    })
    // joinRun hangs until aborted by the connect deadline — never yields. A
    // timeout does NOT prove the run gone: a durable run whose middleware is
    // still booting a sandbox legitimately produces nothing for a while, and
    // clearing on it would permanently orphan a run that is still going. The
    // UI must still free up, but the pointer survives for the next load.
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
    const client = mountedChatClient({
      id: 'chat-quiet',
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

    const stored = read()
    if (!stored || Array.isArray(stored)) {
      throw new Error('expected a persisted record with a resume pointer')
    }
    expect(stored.resume?.resumeState?.runId).toBe('quiet-run')
    void client
  })

  it('clears a dead resume pointer when joinRun is REFUSED before attaching', async () => {
    const { adapter, read } = memoryAdapter({
      messages: [createUIMessage('user-1', 'hi', 'user')],
      resume: {
        resumeState: { threadId: 't1', runId: 'gone-run' },
      },
    })
    // The server answers the join with a hard error (unknown / evicted run)
    // before any chunk — the one signal that PROVES the pointer dead.
    // An async generator that throws before its first yield — TS infers
    // AsyncGenerator<never>, which is assignable to the joinRun contract.
    const joinRun = vi.fn(async function* () {
      await Promise.resolve()
      throw new Error('Unknown or expired memory stream run: "gone-run"')
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }
    let status: string | undefined
    const client = mountedChatClient({
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
        // A bare message array (or a removed key) carries no resume pointer by
        // construction â€” nothing further to assert on the record shape.
        expect(stored === undefined || Array.isArray(stored)).toBe(true)
      }
    })
    void client
  })

  it('with persistence:true a dead server-tail frees the input', async () => {
    // Server hydration reports an active run, but its durability log is gone, so
    // joinRun never attaches. The client must free the input (isLoading false).
    // Being server-authoritative it has no client store to write to at all.
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
      hydrate: () =>
        Promise.resolve({
          messages: [createUIMessage('history-1', 'seed', 'user')],
          activeRun: { runId: 'gone-run' },
          interrupts: null,
        }),
    }
    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })

    await vi.waitFor(
      () => {
        expect(joinRun).toHaveBeenCalled()
        expect(client.getIsLoading()).toBe(false)
      },
      { timeout: 5_000 },
    )
    void client
  })

  it('surfaces post-attach rejoin errors via onError', async () => {
    const { adapter } = memoryAdapter({
      messages: [createUIMessage('user-1', 'hi', 'user')],
      resume: {
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
    const client = mountedChatClient({
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
