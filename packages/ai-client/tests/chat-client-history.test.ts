import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createTextChunks, createUIMessage } from './test-utils'
import type {
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai/client'
import type {
  ChatHydrateOptions,
  ChatHydrationResult,
  ConnectConnectionAdapter,
} from '../src/connection-adapters'
import type { UIMessage } from '../src/types'

function mountedChatClient(
  options: ConstructorParameters<typeof ChatClient>[0],
) {
  const client = new ChatClient(options)
  client.attach()
  return client
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function hydrationResult(
  messages: Array<UIMessage>,
  page?: ChatHydrationResult['page'],
): ChatHydrationResult {
  return {
    messages,
    activeRun: null,
    interrupts: null,
    ...(page === undefined ? {} : { page }),
  }
}

function messageIds(
  messages: Array<UIMessage> | Array<ModelMessage>,
): Array<string> {
  const ids: Array<string> = []
  for (const message of messages) {
    if ('id' in message && typeof message.id === 'string') {
      ids.push(message.id)
    }
  }
  return ids
}

function createHistoryConnection(options: {
  hydrate: NonNullable<ConnectConnectionAdapter['hydrate']>
  onSend?: (messages: Array<UIMessage> | Array<ModelMessage>) => void
  chunks?: Array<StreamChunk>
}): ConnectConnectionAdapter {
  return {
    async *connect(messages) {
      options.onSend?.(messages)
      const chunks = options.chunks ?? createTextChunks('ok', 'assistant-1')
      for (const chunk of chunks) {
        yield chunk
      }
    },
    hydrate: options.hydrate,
  }
}

describe('ChatClient history paging', () => {
  it('hydrate GET includes limit when history.pageSize is set', async () => {
    const hydrateCalls: Array<{
      threadId: string
      options: ChatHydrateOptions | undefined
    }> = []
    const newest = createUIMessage('m-newest', 'latest', 'user')
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: (threadId, options) => {
          hydrateCalls.push({ threadId, options })
          return Promise.resolve(
            hydrationResult([newest], {
              truncated: true,
              cursor: 'm-newest',
            }),
          )
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getMessages().map((message) => message.id)).toEqual([
        'm-newest',
      ])
    })

    expect(hydrateCalls).toEqual([{ threadId: 't1', options: { limit: 50 } }])
    expect(client.getHasOlderMessages()).toBe(true)
  })

  it('loadOlderMessages prepends older ids in front', async () => {
    const windowMessages = [
      createUIMessage('m2', 'two', 'user'),
      createUIMessage('m3', 'three', 'assistant'),
    ]
    const older = createUIMessage('m1', 'one', 'user')
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: (_threadId, options) => {
          if (options?.before === 'm2') {
            return Promise.resolve(
              hydrationResult([older], { truncated: false }),
            )
          }
          return Promise.resolve(
            hydrationResult(windowMessages, {
              truncated: true,
              cursor: 'm2',
            }),
          )
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getMessages().map((message) => message.id)).toEqual([
        'm2',
        'm3',
      ])
    })

    await client.loadOlderMessages()

    expect(client.getMessages().map((message) => message.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ])
    expect(client.getHasOlderMessages()).toBe(false)
  })

  it('send with history.pageSize posts only the new turn', async () => {
    const painted = [
      createUIMessage('old-1', 'earlier', 'user'),
      createUIMessage('old-2', 'reply', 'assistant'),
    ]
    const sentIds: Array<Array<string>> = []
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: () =>
          Promise.resolve(hydrationResult(painted, { truncated: false })),
        onSend: (messages) => {
          sentIds.push(messageIds(messages))
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getMessages().map((message) => message.id)).toEqual([
        'old-1',
        'old-2',
      ])
    })

    await client.sendMessage({ content: 'hello', id: 'new-user' })

    expect(sentIds).toEqual([['new-user']])
  })

  it('send without history.pageSize posts the painted window', async () => {
    const painted = [
      createUIMessage('old-1', 'earlier', 'user'),
      createUIMessage('old-2', 'reply', 'assistant'),
    ]
    const sentIds: Array<Array<string>> = []
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      connection: createHistoryConnection({
        hydrate: () => Promise.resolve(hydrationResult(painted)),
        onSend: (messages) => {
          sentIds.push(messageIds(messages))
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getMessages().map((message) => message.id)).toEqual([
        'old-1',
        'old-2',
      ])
    })

    await client.sendMessage({ content: 'hello', id: 'new-user' })

    expect(sentIds).toEqual([['old-1', 'old-2', 'new-user']])
  })

  it('loadOlderMessages rejects on network fail and keeps painted messages', async () => {
    const windowMessages = [
      createUIMessage('m2', 'two', 'user'),
      createUIMessage('m3', 'three', 'assistant'),
    ]
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: (_threadId, options) => {
          if (options?.before !== undefined) {
            return Promise.reject(new Error('network down'))
          }
          return Promise.resolve(
            hydrationResult(windowMessages, {
              truncated: true,
              cursor: 'm2',
            }),
          )
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getHasOlderMessages()).toBe(true)
    })

    await expect(client.loadOlderMessages()).rejects.toThrow('network down')

    expect(client.getMessages().map((message) => message.id)).toEqual([
      'm2',
      'm3',
    ])
    expect(client.getHasOlderMessages()).toBe(true)
  })

  it('loadOlderMessages no-ops while a page load is in flight', async () => {
    const windowMessages = [
      createUIMessage('m2', 'two', 'user'),
      createUIMessage('m3', 'three', 'assistant'),
    ]
    const older = createUIMessage('m1', 'one', 'user')
    const olderPage = createDeferred<ChatHydrationResult>()
    let olderFetchCount = 0
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: (_threadId, options) => {
          if (options?.before === 'm2') {
            olderFetchCount += 1
            return olderPage.promise
          }
          return Promise.resolve(
            hydrationResult(windowMessages, {
              truncated: true,
              cursor: 'm2',
            }),
          )
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getHasOlderMessages()).toBe(true)
    })

    const first = client.loadOlderMessages()
    const second = client.loadOlderMessages()
    olderPage.resolve(hydrationResult([older], { truncated: false }))
    await Promise.all([first, second])

    expect(olderFetchCount).toBe(1)
    expect(client.getMessages().map((message) => message.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ])
  })

  it('reload sends the last user so persistence can cut the stored tail', async () => {
    const painted = [
      createUIMessage('u1', 'ask', 'user'),
      createUIMessage('a1', 'old', 'assistant'),
    ]
    const sentIds: Array<Array<string>> = []
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: () =>
          Promise.resolve(hydrationResult(painted, { truncated: false })),
        onSend: (messages) => {
          sentIds.push(messageIds(messages))
        },
        chunks: createTextChunks('new', 'a2'),
      }),
    })

    await vi.waitFor(() => {
      expect(client.getMessages().map((message) => message.id)).toEqual([
        'u1',
        'a1',
      ])
    })

    await client.reload()

    expect(sentIds[0]).toEqual(['u1'])
  })

  it('resume after a paged hydrate posts from the last user through the assistant', async () => {
    const painted = [
      createUIMessage('u1', 'ask', 'user'),
      createUIMessage('a1', 'tool?', 'assistant'),
    ]
    const sentIds: Array<Array<string>> = []
    const resume: Array<RunAgentResumeItem> = [
      {
        interruptId: 'i1',
        status: 'resolved',
        payload: { approved: true },
      },
    ]
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: () =>
          Promise.resolve({
            messages: painted,
            activeRun: null,
            interrupts: {
              runId: 'run-1',
              pending: [
                {
                  id: 'i1',
                  reason: 'approval_requested',
                  message: 'Approve?',
                },
              ],
            },
            page: { truncated: false },
          }),
        onSend: (messages) => {
          sentIds.push(messageIds(messages))
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getMessages().map((message) => message.id)).toEqual([
        'u1',
        'a1',
      ])
    })

    await client.resumeInterruptsUnsafe(resume, {
      threadId: 't1',
      runId: 'run-1',
    })

    expect(sentIds[0]).toEqual(['u1', 'a1'])
  })

  it('send after Load older still posts only the new turn', async () => {
    const windowMessages = [
      createUIMessage('m2', 'two', 'user'),
      createUIMessage('m3', 'three', 'assistant'),
    ]
    const older = createUIMessage('m1', 'one', 'user')
    const sentIds: Array<Array<string>> = []
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: (_threadId, options) => {
          if (options?.before === 'm2') {
            return Promise.resolve(
              hydrationResult([older], { truncated: false }),
            )
          }
          return Promise.resolve(
            hydrationResult(windowMessages, {
              truncated: true,
              cursor: 'm2',
            }),
          )
        },
        onSend: (messages) => {
          sentIds.push(messageIds(messages))
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getHasOlderMessages()).toBe(true)
    })
    await client.loadOlderMessages()
    await client.sendMessage({ content: 'hello', id: 'new-user' })

    expect(sentIds[0]).toEqual(['new-user'])
  })

  it('loadOlderMessages rejects an empty older page and keeps hasOlderMessages', async () => {
    const windowMessages = [
      createUIMessage('m2', 'two', 'user'),
      createUIMessage('m3', 'three', 'assistant'),
    ]
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: (_threadId, options) => {
          if (options?.before === 'm2') {
            return Promise.resolve(
              hydrationResult([], { truncated: true, cursor: 'm2' }),
            )
          }
          return Promise.resolve(
            hydrationResult(windowMessages, {
              truncated: true,
              cursor: 'm2',
            }),
          )
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getHasOlderMessages()).toBe(true)
    })

    await expect(client.loadOlderMessages()).rejects.toThrow(
      'Older page was empty',
    )
    expect(client.getMessages().map((message) => message.id)).toEqual([
      'm2',
      'm3',
    ])
    expect(client.getHasOlderMessages()).toBe(true)
  })

  it('applies page state before prepend so the last page is not stuck', async () => {
    const windowMessages = [
      createUIMessage('m2', 'two', 'user'),
      createUIMessage('m3', 'three', 'assistant'),
    ]
    const older = createUIMessage('m1', 'one', 'user')
    const hasOlderOnChange: Array<boolean> = []
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      onMessagesChange: (messages) => {
        if (messages.some((message) => message.id === 'm1')) {
          hasOlderOnChange.push(client.getHasOlderMessages())
        }
      },
      connection: createHistoryConnection({
        hydrate: (_threadId, options) => {
          if (options?.before === 'm2') {
            return Promise.resolve(
              hydrationResult([older], { truncated: false }),
            )
          }
          return Promise.resolve(
            hydrationResult(windowMessages, {
              truncated: true,
              cursor: 'm2',
            }),
          )
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getHasOlderMessages()).toBe(true)
    })
    await client.loadOlderMessages()

    expect(hasOlderOnChange[0]).toBe(false)
    expect(client.getHasOlderMessages()).toBe(false)
  })

  it('clear resets older-page state and ignores a late older fetch', async () => {
    const windowMessages = [
      createUIMessage('m2', 'two', 'user'),
      createUIMessage('m3', 'three', 'assistant'),
    ]
    const older = createUIMessage('m1', 'one', 'user')
    const olderPage = createDeferred<ChatHydrationResult>()
    const client = mountedChatClient({
      threadId: 't1',
      persistence: true,
      history: { pageSize: 50 },
      connection: createHistoryConnection({
        hydrate: (_threadId, options) => {
          if (options?.before === 'm2') {
            return olderPage.promise
          }
          return Promise.resolve(
            hydrationResult(windowMessages, {
              truncated: true,
              cursor: 'm2',
            }),
          )
        },
      }),
    })

    await vi.waitFor(() => {
      expect(client.getHasOlderMessages()).toBe(true)
    })

    const pending = client.loadOlderMessages()
    client.clear()
    olderPage.resolve(hydrationResult([older], { truncated: false }))
    await pending

    expect(client.getMessages()).toEqual([])
    expect(client.getHasOlderMessages()).toBe(false)
  })
})
