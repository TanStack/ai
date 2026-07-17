import { describe, expect, it, vi } from 'vitest'
import { ChatPersistenceController } from '../src/chat-persistence-controller'
import { localStoragePersistence } from '../src/storage-adapters'
import { createUIMessage } from './test-utils'
import type {
  ChatClientPersistence,
  ChatResumeSnapshot,
  ChatServerPersistence,
  UIMessage,
} from '../src/types'

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred promise resolved before initialization')
  }
  let reject: (reason?: unknown) => void = () => {
    throw new Error('Deferred promise rejected before initialization')
  }
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function messageAdapter(
  initial?: Array<UIMessage> | null,
): ChatClientPersistence {
  return {
    getItem: vi.fn(() => initial),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}

function resumeAdapter(
  initial?: ChatResumeSnapshot | null,
): ChatServerPersistence {
  return {
    getItem: vi.fn(() => initial),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}

function resumeSnapshot(runId: string): ChatResumeSnapshot {
  return {
    resumeState: { threadId: 'thread-1', runId },
    pendingInterrupts: [],
  }
}

function createController(options: {
  messages?: ChatClientPersistence
  resume?: ChatServerPersistence
  canHydrateResume?: () => boolean
}) {
  const applyMessages = vi.fn<(messages: Array<UIMessage>) => void>()
  const applyResumeSnapshot = vi.fn<(snapshot: ChatResumeSnapshot) => void>()
  const reportResumeError = vi.fn<(error: unknown) => void>()
  const controller = new ChatPersistenceController({
    chatId: 'chat-1',
    threadId: 'thread-1',
    messageAdapter: options.messages,
    resumeAdapter: options.resume,
    applyMessages,
    applyResumeSnapshot,
    canHydrateResume: options.canHydrateResume ?? (() => true),
    reportResumeError,
  })
  return {
    applyMessages,
    applyResumeSnapshot,
    controller,
    reportResumeError,
  }
}

describe('ChatPersistenceController', () => {
  it('reads synchronous message and resume state with their independent keys', () => {
    const messages = [createUIMessage('stored')]
    const snapshot = resumeSnapshot('stored-run')
    const messagesStore = messageAdapter(messages)
    const resumeStore = resumeAdapter(snapshot)
    const { controller } = createController({
      messages: messagesStore,
      resume: resumeStore,
    })

    expect(controller.readInitialMessages()).toBe(messages)
    expect(controller.readInitialResumeSnapshot()).toBe(snapshot)
    expect(messagesStore.getItem).toHaveBeenCalledWith('chat-1')
    expect(resumeStore.getItem).toHaveBeenCalledWith('thread-1')
  })

  it('hydrates asynchronous lanes without letting stale reads overwrite newer state', async () => {
    const messagesRead = deferred<Array<UIMessage>>()
    const resumeRead = deferred<ChatResumeSnapshot>()
    const messagesStore = messageAdapter()
    messagesStore.getItem = vi.fn(() => messagesRead.promise)
    const resumeStore = resumeAdapter()
    resumeStore.getItem = vi.fn(() => resumeRead.promise)
    const { applyMessages, applyResumeSnapshot, controller } = createController(
      {
        messages: messagesStore,
        resume: resumeStore,
      },
    )

    controller.hydrateMessages(controller.readInitialMessages())
    controller.hydrateResumeSnapshot(controller.readInitialResumeSnapshot())
    controller.messagesChanged([createUIMessage('local')])
    controller.persistResumeSnapshot(null)
    messagesRead.resolve([createUIMessage('stale')])
    resumeRead.resolve(resumeSnapshot('stale-run'))
    await Promise.all([messagesRead.promise, resumeRead.promise])
    await Promise.resolve()

    expect(applyMessages).not.toHaveBeenCalled()
    expect(applyResumeSnapshot).not.toHaveBeenCalled()
  })

  it('keeps message and resume writes on independent ordered lanes', async () => {
    const firstMessageWrite = deferred<void>()
    const firstResumeWrite = deferred<void>()
    const messagesStore = messageAdapter()
    messagesStore.setItem = vi
      .fn()
      .mockReturnValueOnce(firstMessageWrite.promise)
      .mockResolvedValue(undefined)
    const resumeStore = resumeAdapter()
    resumeStore.setItem = vi.fn(() => firstResumeWrite.promise)
    const { controller } = createController({
      messages: messagesStore,
      resume: resumeStore,
    })

    controller.messagesChanged([createUIMessage('message-a')])
    controller.messagesChanged([createUIMessage('message-b')])
    controller.persistResumeSnapshot(resumeSnapshot('run-a'))
    controller.persistResumeSnapshot(null)

    expect(messagesStore.setItem).toHaveBeenCalledTimes(1)
    expect(resumeStore.setItem).toHaveBeenCalledTimes(1)
    expect(resumeStore.removeItem).not.toHaveBeenCalled()

    firstMessageWrite.resolve()
    await firstMessageWrite.promise
    await Promise.resolve()
    expect(messagesStore.setItem).toHaveBeenCalledTimes(2)

    firstResumeWrite.resolve()
    await firstResumeWrite.promise
    await Promise.resolve()
    expect(resumeStore.removeItem).toHaveBeenCalledWith('thread-1')
  })

  it('skips superseded queued resume writes and reconciles the newest state', async () => {
    const firstWrite = deferred<void>()
    const resumeStore = resumeAdapter()
    resumeStore.setItem = vi
      .fn()
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValue(undefined)
    const { controller } = createController({ resume: resumeStore })

    controller.persistResumeSnapshot(resumeSnapshot('run-a'))
    controller.persistResumeSnapshot(resumeSnapshot('run-b'))
    controller.persistResumeSnapshot(null)
    firstWrite.resolve()
    await firstWrite.promise
    await Promise.resolve()
    await Promise.resolve()

    expect(resumeStore.setItem).toHaveBeenCalledTimes(1)
    expect(resumeStore.removeItem).toHaveBeenCalledWith('thread-1')
  })

  it('removes messages after skipping the clear snapshot and invalidates queued writes', async () => {
    const firstWrite = deferred<void>()
    const messagesStore = messageAdapter()
    messagesStore.setItem = vi
      .fn()
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValue(undefined)
    const { controller } = createController({ messages: messagesStore })

    controller.messagesChanged([createUIMessage('before')])
    controller.messagesChanged([createUIMessage('queued')])
    controller.prepareMessagesClear()
    controller.messagesChanged([])
    controller.removeMessages()
    firstWrite.resolve()
    await firstWrite.promise
    await Promise.resolve()
    await Promise.resolve()

    expect(messagesStore.setItem).toHaveBeenCalledTimes(1)
    expect(messagesStore.removeItem).toHaveBeenCalledWith('chat-1')
  })

  it('invalidates asynchronous hydration and queued work on dispose', async () => {
    const messagesRead = deferred<Array<UIMessage>>()
    const resumeRead = deferred<ChatResumeSnapshot>()
    const pendingWrite = deferred<void>()
    const messagesStore = messageAdapter()
    messagesStore.getItem = vi.fn(() => messagesRead.promise)
    messagesStore.setItem = vi
      .fn()
      .mockReturnValueOnce(pendingWrite.promise)
      .mockResolvedValue(undefined)
    const resumeStore = resumeAdapter()
    resumeStore.getItem = vi.fn(() => resumeRead.promise)
    const { applyMessages, applyResumeSnapshot, controller } = createController(
      {
        messages: messagesStore,
        resume: resumeStore,
      },
    )

    controller.hydrateMessages(controller.readInitialMessages())
    controller.hydrateResumeSnapshot(controller.readInitialResumeSnapshot())
    controller.messagesChanged([createUIMessage('in-flight')])
    controller.messagesChanged([createUIMessage('queued')])
    controller.dispose()
    messagesRead.resolve([createUIMessage('stored')])
    resumeRead.resolve(resumeSnapshot('stored-run'))
    pendingWrite.resolve()
    await Promise.all([
      messagesRead.promise,
      resumeRead.promise,
      pendingWrite.promise,
    ])
    await Promise.resolve()

    expect(applyMessages).not.toHaveBeenCalled()
    expect(applyResumeSnapshot).not.toHaveBeenCalled()
    expect(messagesStore.setItem).toHaveBeenCalledTimes(1)
  })

  it('keeps message failures best-effort and reports resume failures', async () => {
    vi.stubGlobal('localStorage', undefined)
    const messagesStore = localStoragePersistence<Array<UIMessage>>({
      serialize: (messages) => {
        const value = JSON.stringify(messages)
        if (value === undefined) {
          throw new TypeError('Messages are not JSON serializable')
        }
        return value
      },
      deserialize: JSON.parse,
    })
    const resumeStore = localStoragePersistence<ChatResumeSnapshot>({
      serialize: (snapshot) => {
        const value = JSON.stringify(snapshot)
        if (value === undefined) {
          throw new TypeError('Resume state is not JSON serializable')
        }
        return value
      },
      deserialize: JSON.parse,
    })
    const { controller, reportResumeError } = createController({
      messages: messagesStore,
      resume: resumeStore,
    })

    expect(controller.readInitialMessages()).toBeUndefined()
    expect(controller.readInitialResumeSnapshot()).toBeUndefined()
    expect(reportResumeError).toHaveBeenCalledTimes(1)
    controller.messagesChanged([createUIMessage('message')])
    controller.persistResumeSnapshot(resumeSnapshot('run'))
    await Promise.resolve()

    expect(reportResumeError).toHaveBeenCalledTimes(2)
  })
})
