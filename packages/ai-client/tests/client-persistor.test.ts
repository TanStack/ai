import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatPersistor, localStorageAIPersistence } from '../src/client-persistor'
import { createMockPersistence, createUIMessage } from './test-utils'
import type { StreamChunk } from '@tanstack/ai/client'
import type { ChatClientPersistence, UIMessage } from '../src/types'

const CHAT_ID = 'chat-1'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Resolve after pending micro- and macro-tasks have drained. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** A promise with externally accessible resolve/reject. */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Build a persistor wired to `adapter` with a spy `applyMessages` callback so
 * tests can assert what (if anything) gets re-applied to the client.
 */
function createPersistor(adapter: ChatClientPersistence, id: string = CHAT_ID) {
  const applyMessages = vi.fn<(messages: Array<UIMessage>) => void>()
  const persistor = new ChatPersistor(adapter, id, applyMessages)
  return { persistor, applyMessages }
}

// --- typed StreamChunk fixtures -------------------------------------------
// These satisfy the StreamChunk union directly (no casts). The persistor only
// ever reads `type` and the relevant id field off a chunk, and unit-test chunks
// are never run through the connection adapter's run-context map, so the run id
// must live on the chunk itself (only RUN_STARTED/RUN_FINISHED carry one).

function runStarted(runId: string, threadId: string = 'thread-1'): StreamChunk {
  return { type: EventType.RUN_STARTED, threadId, runId }
}

function runFinished(
  runId: string,
  threadId: string = 'thread-1',
): StreamChunk {
  return { type: EventType.RUN_FINISHED, threadId, runId }
}

function runError(message: string = 'boom'): StreamChunk {
  return { type: EventType.RUN_ERROR, message }
}

function textContent(messageId: string, delta: string = 'hi'): StreamChunk {
  return { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta }
}

function toolCallStart(
  toolCallId: string,
  parentMessageId?: string,
): StreamChunk {
  return {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: 'tool',
    toolName: 'tool',
    ...(parentMessageId ? { parentMessageId } : {}),
  }
}

function messagesSnapshot(): StreamChunk {
  return { type: EventType.MESSAGES_SNAPSHOT, messages: [] }
}

describe('ChatPersistor', () => {
  describe('localStorageAIPersistence', () => {
    it('stores generic values under the configured prefix', () => {
      const storage = new Map<string, string>()
      vi.stubGlobal('localStorage', {
        get length() {
          return storage.size
        },
        clear: vi.fn(() => storage.clear()),
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
        removeItem: vi.fn((key: string) => {
          storage.delete(key)
        }),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value)
        }),
      } satisfies Storage)

      const adapter = localStorageAIPersistence<{ count: number }>({
        keyPrefix: 'custom-prefix:',
      })

      adapter.setItem('value-1', { count: 42 })

      expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
        'custom-prefix:value-1',
        JSON.stringify({ count: 42 }),
      )
      expect(adapter.getItem('value-1')).toEqual({ count: 42 })
    })
  })

  describe('readInitial', () => {
    it('returns the stored messages from a synchronous getItem', () => {
      const stored = [createUIMessage('m-1')]
      const adapter = createMockPersistence(stored)
      const { persistor } = createPersistor(adapter)

      expect(persistor.readInitial()).toBe(stored)
      expect(adapter.getItem).toHaveBeenCalledWith(CHAT_ID)
    })

    it('returns the promise from an asynchronous getItem', () => {
      const stored = [createUIMessage('m-1')]
      const adapter = createMockPersistence()
      adapter.getItem = vi.fn(() => Promise.resolve(stored))
      const { persistor } = createPersistor(adapter)

      expect(persistor.readInitial()).toBeInstanceOf(Promise)
    })

    it('swallows a throwing getItem and returns undefined', () => {
      const adapter = createMockPersistence()
      adapter.getItem = vi.fn(() => {
        throw new Error('storage unavailable')
      })
      const { persistor } = createPersistor(adapter)

      expect(persistor.readInitial()).toBeUndefined()
    })
  })

  describe('hydrateAsync', () => {
    it('applies messages once the promise resolves to an array', async () => {
      const stored = [createUIMessage('persisted-1')]
      const { persistor, applyMessages } = createPersistor(
        createMockPersistence(),
      )

      persistor.hydrateAsync(Promise.resolve(stored))
      await flushAsync()

      expect(applyMessages).toHaveBeenCalledWith(stored)
    })

    it.each([
      ['null', null],
      ['undefined', undefined],
    ])(
      'does not apply when the promise resolves to %s',
      async (_label, value) => {
        const { persistor, applyMessages } = createPersistor(
          createMockPersistence(),
        )

        persistor.hydrateAsync(Promise.resolve(value))
        await flushAsync()

        expect(applyMessages).not.toHaveBeenCalled()
      },
    )

    it('does nothing for a synchronous (non-promise) value', async () => {
      const { persistor, applyMessages } = createPersistor(
        createMockPersistence(),
      )

      persistor.hydrateAsync([createUIMessage('m-1')])
      await flushAsync()

      expect(applyMessages).not.toHaveBeenCalled()
    })

    it('does not apply if messages changed before hydration resolves', async () => {
      const deferred = createDeferred<Array<UIMessage>>()
      const { persistor, applyMessages } = createPersistor(
        createMockPersistence(),
      )

      persistor.hydrateAsync(deferred.promise)
      // A local change lands before the slow getItem resolves.
      persistor.notifyMessagesChanged([createUIMessage('local-1')])
      deferred.resolve([createUIMessage('persisted-1')])
      await flushAsync()

      expect(applyMessages).not.toHaveBeenCalled()
    })

    it('swallows a rejected hydration promise', async () => {
      const { persistor, applyMessages } = createPersistor(
        createMockPersistence(),
      )

      persistor.hydrateAsync(Promise.reject(new Error('read failed')))
      await flushAsync()

      expect(applyMessages).not.toHaveBeenCalled()
    })
  })

  describe('notifyMessagesChanged', () => {
    it('persists the messages on change', () => {
      const adapter = createMockPersistence()
      const { persistor } = createPersistor(adapter)
      const messages = [createUIMessage('m-1')]

      persistor.notifyMessagesChanged(messages)

      expect(adapter.setItem).toHaveBeenCalledWith(CHAT_ID, messages)
    })

    it('persists a snapshot, not the live array reference', () => {
      const adapter = createMockPersistence()
      const { persistor } = createPersistor(adapter)
      const messages = [createUIMessage('m-1')]

      persistor.notifyMessagesChanged(messages)
      messages.push(createUIMessage('m-2'))

      const persisted = vi.mocked(adapter.setItem).mock.calls[0]?.[1]
      expect(persisted).toHaveLength(1)
    })

    it('skips exactly one write after beginClear, then resumes', () => {
      const adapter = createMockPersistence()
      const { persistor } = createPersistor(adapter)

      persistor.notifyMessagesChanged([createUIMessage('m-1')])
      persistor.beginClear()
      persistor.notifyMessagesChanged([]) // the clear's empty snapshot — skipped
      persistor.notifyMessagesChanged([createUIMessage('m-2')])

      expect(adapter.setItem).toHaveBeenCalledTimes(2)
    })

    it('swallows a synchronous setItem error', () => {
      const adapter = createMockPersistence()
      adapter.setItem = vi.fn(() => {
        throw new Error('quota exceeded')
      })
      const { persistor } = createPersistor(adapter)

      expect(() =>
        persistor.notifyMessagesChanged([createUIMessage('m-1')]),
      ).not.toThrow()
    })

    it('runs async writes sequentially (FIFO, no overlap)', async () => {
      const first = createDeferred<void>()
      const second = createDeferred<void>()
      const adapter = createMockPersistence()
      adapter.setItem = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
      const { persistor } = createPersistor(adapter)

      persistor.notifyMessagesChanged([createUIMessage('a')])
      persistor.notifyMessagesChanged([createUIMessage('b')])
      // Second write is queued behind the first and must not have started yet.
      expect(adapter.setItem).toHaveBeenCalledTimes(1)

      first.resolve()
      await flushAsync()

      expect(adapter.setItem).toHaveBeenCalledTimes(2)
      expect(vi.mocked(adapter.setItem).mock.calls[1]?.[1]).toEqual([
        createUIMessage('b'),
      ])
    })

    it('keeps writing after an async write rejects', async () => {
      const adapter = createMockPersistence()
      adapter.setItem = vi
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue(undefined)
      const { persistor } = createPersistor(adapter)

      persistor.notifyMessagesChanged([createUIMessage('a')])
      persistor.notifyMessagesChanged([createUIMessage('b')])
      await flushAsync()

      expect(adapter.setItem).toHaveBeenCalledTimes(2)
    })
  })

  describe('remove', () => {
    it('removes the persisted conversation', () => {
      const adapter = createMockPersistence()
      const { persistor } = createPersistor(adapter)

      persistor.remove()

      expect(adapter.removeItem).toHaveBeenCalledWith(CHAT_ID)
    })

    it('swallows a synchronous removeItem error', () => {
      const adapter = createMockPersistence()
      adapter.removeItem = vi.fn(() => {
        throw new Error('locked')
      })
      const { persistor } = createPersistor(adapter)

      expect(() => persistor.remove()).not.toThrow()
    })

    it('invalidates a queued write that a removal supersedes', async () => {
      const inFlight = createDeferred<void>()
      const adapter = createMockPersistence()
      adapter.setItem = vi
        .fn()
        .mockReturnValueOnce(inFlight.promise) // write A (in flight)
        .mockResolvedValue(undefined) // write B (would run later)
      const { persistor } = createPersistor(adapter)

      persistor.notifyMessagesChanged([createUIMessage('a')]) // starts, in flight
      persistor.notifyMessagesChanged([createUIMessage('b')]) // queued behind A
      persistor.remove() // bumps generation, queued behind B

      inFlight.resolve()
      await flushAsync()

      // B's generation was superseded by remove(), so only A was written.
      expect(adapter.setItem).toHaveBeenCalledTimes(1)
      expect(adapter.removeItem).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear-during-stream suppression', () => {
    it('does not ignore chunks before a clear', () => {
      const { persistor } = createPersistor(createMockPersistence())

      expect(persistor.shouldIgnoreChunk(runStarted('run-1'))).toBe(false)
      expect(persistor.shouldIgnoreChunk(textContent('msg-1'))).toBe(false)
    })

    it('ignores chunks for a message id captured at clear time', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [createUIMessage('msg-1')],
        activeRunIds: new Set(),
        currentRunId: null,
      })

      expect(persistor.shouldIgnoreChunk(textContent('msg-1'))).toBe(true)
      expect(persistor.shouldIgnoreChunk(textContent('msg-other'))).toBe(false)
    })

    it('ignores a RUN_STARTED for an active run captured at clear time', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [],
        activeRunIds: new Set(['run-1']),
        currentRunId: null,
      })

      expect(persistor.shouldIgnoreChunk(runStarted('run-1'))).toBe(true)
    })

    it('ignores the in-flight currentRunId captured at clear time', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [],
        activeRunIds: new Set(),
        currentRunId: 'run-current',
      })

      expect(persistor.shouldIgnoreChunk(runStarted('run-current'))).toBe(true)
    })

    it('ignores runless content chunks belonging to a cleared run', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [],
        activeRunIds: new Set(['run-1']),
        currentRunId: null,
      })
      // The cleared run starts again, pinning it as the current runless run.
      persistor.shouldIgnoreChunk(runStarted('run-1'))

      expect(persistor.shouldIgnoreChunk(textContent('late-msg'))).toBe(true)
      expect(persistor.shouldIgnoreChunk(messagesSnapshot())).toBe(true)
    })

    it('ignores tool chunks by cleared parentMessageId and remembers the toolCallId', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [createUIMessage('parent-msg')],
        activeRunIds: new Set(),
        currentRunId: null,
      })

      // First seen via its parent message id...
      expect(
        persistor.shouldIgnoreChunk(toolCallStart('tc-1', 'parent-msg')),
      ).toBe(true)
      // ...then a later chunk for the same tool call (no parent) is still ignored.
      expect(persistor.shouldIgnoreChunk(toolCallStart('tc-1'))).toBe(true)
    })
  })

  describe('run lifecycle hooks', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('forgets a settled run so a later run with the same id is not ignored', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [],
        activeRunIds: new Set(['run-1']),
        currentRunId: null,
      })
      expect(persistor.shouldIgnoreChunk(runStarted('run-1'))).toBe(true)

      persistor.onRunSettled('run-1')

      expect(persistor.shouldIgnoreChunk(runStarted('run-1'))).toBe(false)
    })

    it('stops ignoring runless chunks after a session-level run error', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [],
        activeRunIds: new Set(['run-1']),
        currentRunId: null,
      })
      persistor.shouldIgnoreChunk(runStarted('run-1'))
      expect(persistor.shouldIgnoreChunk(textContent('late-1'))).toBe(true)

      persistor.onSessionRunError()

      // A fresh runless chunk is no longer attributed to the cleared run. (An
      // already-seen message id stays ignored — shouldIgnoreChunk records it.)
      expect(persistor.shouldIgnoreChunk(textContent('late-2'))).toBe(false)
    })

    it('takeRunlessRunId returns and clears the current runless run, then null', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [],
        activeRunIds: new Set(['run-1']),
        currentRunId: null,
      })
      persistor.shouldIgnoreChunk(runStarted('run-1'))

      expect(persistor.takeRunlessRunId()).toBe('run-1')
      expect(persistor.takeRunlessRunId()).toBeNull()
      // The drained run is no longer pinned, so runless chunks aren't ignored.
      expect(persistor.shouldIgnoreChunk(textContent('late'))).toBe(false)
    })

    it('resetIgnored only clears active-run markers, not cleared ids', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [createUIMessage('msg-1')],
        activeRunIds: new Set(['run-1']),
        currentRunId: null,
      })

      persistor.resetIgnored()

      // Cleared run/message ids survive a reset (they outlive the active run).
      expect(persistor.shouldIgnoreChunk(runStarted('run-1'))).toBe(true)
      expect(persistor.shouldIgnoreChunk(textContent('msg-1'))).toBe(true)
    })

    it('does not ignore an unrelated runId-less run error', () => {
      const { persistor } = createPersistor(createMockPersistence())

      expect(persistor.shouldIgnoreChunk(runError())).toBe(false)
    })

    it('onRunStarted for a non-cleared run does not suppress runless chunks', () => {
      const { persistor } = createPersistor(createMockPersistence())

      // Pinning a live (never-cleared) run must not start swallowing its output.
      persistor.onRunStarted('run-live')

      expect(persistor.shouldIgnoreChunk(textContent('content'))).toBe(false)
    })

    it('advances the runless pointer when the active run finishes', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [],
        activeRunIds: new Set(['run-1', 'run-2']),
        currentRunId: null,
      })
      persistor.shouldIgnoreChunk(runStarted('run-1'))
      persistor.shouldIgnoreChunk(runStarted('run-2'))

      // run-2 was the pinned runless run; settling it falls back to run-1.
      persistor.onRunSettled('run-2')

      expect(persistor.shouldIgnoreChunk(runFinished('run-2'))).toBe(false)
      expect(persistor.shouldIgnoreChunk(textContent('late'))).toBe(true)
    })

    it('keeps suppressing a second cleared run after the first drains via a runless error', () => {
      const { persistor } = createPersistor(createMockPersistence())
      persistor.snapshotClear({
        messages: [],
        activeRunIds: new Set(['run-1', 'run-2']),
        currentRunId: null,
      })
      persistor.shouldIgnoreChunk(runStarted('run-1'))
      persistor.shouldIgnoreChunk(runStarted('run-2')) // run-2 now pinned

      // A runId-less RUN_ERROR drains the pinned run (run-2)...
      expect(persistor.takeRunlessRunId()).toBe('run-2')

      // ...but run-1 is still cleared, so its runless content stays suppressed
      // instead of leaking through once the pointer advances back to it.
      expect(persistor.shouldIgnoreChunk(textContent('late-from-run-1'))).toBe(
        true,
      )
    })
  })
})
