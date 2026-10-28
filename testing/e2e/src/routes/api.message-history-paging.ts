import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  defineAIPersistence,
  defineMessageStore,
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import type { AnyTextAdapter, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { MessagePage, MessageStore } from '@tanstack/ai-persistence'

/**
 * Provider-free harness for server-authoritative history paging.
 *
 * GET hydrates through `reconstructChat` (the `persistence: true` mount probe).
 * POST runs `chat()` through `withPersistence`. `?store=page` uses a
 * MessagePage adapter; the default store returns the full array and lets
 * reconstructChat slice.
 *
 * Exempt from aimock: the adapter streams a fixed AG-UI sequence.
 */

const PAGING_REPLY = 'PAGE_OK'

const lastIncomingIds = new Map<string, Array<string>>()

const arrayPersistence = memoryPersistence()
const pagedInner = memoryPersistence()
const pagedPersistence = defineAIPersistence({
  stores: {
    messages: defineMessageStore({
      // One implementation covers both overloads: no options → full array,
      // paging hint → MessagePage. TypeScript cannot express that as both
      // call signatures without this assertion.
      loadThread(
        threadId: string,
        options?: { limit?: number; before?: string },
      ) {
        return loadPaged(pagedInner.stores.messages, threadId, options)
      },
      saveThread(threadId, messages) {
        return pagedInner.stores.messages.saveThread(threadId, messages)
      },
    } as MessageStore),
    runs: pagedInner.stores.runs,
    interrupts: pagedInner.stores.interrupts,
    metadata: pagedInner.stores.metadata,
  },
})

async function loadPaged(
  inner: MessageStore,
  threadId: string,
  options?: { limit?: number; before?: string },
): Promise<Array<ModelMessage> | MessagePage> {
  const all = await inner.loadThread(threadId)
  if (options?.limit === undefined) return all
  let slice = all
  const before = options.before
  if (before !== undefined) {
    const cut = all.findIndex((message) => message.id === before)
    if (cut === -1) return { messages: [], truncated: false }
    slice = all.slice(0, cut)
  }
  if (slice.length <= options.limit) {
    return { messages: slice, truncated: false }
  }
  const window = slice.slice(slice.length - options.limit)
  const cursor = window[0]?.id
  if (cursor === undefined || cursor === '') {
    return { messages: window, truncated: false }
  }
  return { messages: window, truncated: true, cursor }
}

function persistenceFor(request: Request) {
  const store = new URL(request.url).searchParams.get('store')
  return store === 'page' ? pagedPersistence : arrayPersistence
}

function replyRun(threadId: string, runId: string): AsyncIterable<StreamChunk> {
  const messageId = `assistant-${runId}`
  return (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      timestamp: Date.now(),
    } satisfies StreamChunk
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp: Date.now(),
    } satisfies StreamChunk
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: PAGING_REPLY,
      timestamp: Date.now(),
    } satisfies StreamChunk
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: Date.now(),
    } satisfies StreamChunk
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      timestamp: Date.now(),
      outcome: { type: 'success' },
    } satisfies StreamChunk
  })()
}

const adapter = {
  kind: 'text' as const,
  name: 'fixed',
  model: 'test-model',
  '~types': {},
  chatStream: ({ threadId, runId }: { threadId: string; runId: string }) =>
    replyRun(threadId, runId),
  structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
  // Fixed-sequence harness adapters in this package cannot satisfy the
  // generic `~types` bag without a double assertion.
} as unknown as AnyTextAdapter

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(body: unknown, key: string): string | undefined {
  if (!isRecord(body) || !(key in body)) return undefined
  const value = body[key]
  return typeof value === 'string' ? value : undefined
}

function seedMessages(value: unknown): Array<ModelMessage> {
  if (!Array.isArray(value)) {
    throw new Error('seed messages must be an array')
  }
  const messages: Array<ModelMessage> = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      throw new Error('seed message must be an object')
    }
    if (entry.role !== 'user' && entry.role !== 'assistant') {
      throw new Error('seed message role must be user or assistant')
    }
    if (typeof entry.content !== 'string') {
      throw new Error('seed message content must be a string')
    }
    if (typeof entry.id !== 'string' || entry.id === '') {
      throw new Error('seed message id must be a string')
    }
    messages.push({
      id: entry.id,
      role: entry.role,
      content: entry.content,
    })
  }
  return messages
}

function incomingIds(messages: ReadonlyArray<{ id?: string }>): Array<string> {
  const ids: Array<string> = []
  for (const message of messages) {
    if (typeof message.id === 'string' && message.id !== '') {
      ids.push(message.id)
    }
  }
  return ids
}

async function inspectBody(request: Request, threadId: string) {
  const persistence = persistenceFor(request)
  const stored = await persistence.stores.messages.loadThread(threadId)
  return {
    stored: stored.map((message) => ({
      id: message.id,
      role: message.role,
      content: typeof message.content === 'string' ? message.content : '',
    })),
    lastIncomingIds: lastIncomingIds.get(threadId) ?? [],
  }
}

export const Route = createFileRoute('/api/message-history-paging')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const persistence = persistenceFor(request)
        const body: unknown = await request.json()

        if (url.searchParams.get('seed') === '1') {
          const threadId = stringField(body, 'threadId')
          if (threadId === undefined || threadId === '') {
            return new Response('threadId required', { status: 400 })
          }
          if (!isRecord(body)) {
            return new Response('invalid seed body', { status: 400 })
          }
          await persistence.stores.messages.saveThread(
            threadId,
            seedMessages(body.messages),
          )
          return Response.json({ threadId })
        }

        if (url.searchParams.get('run') === '1') {
          const threadId = stringField(body, 'threadId')
          if (threadId === undefined || threadId === '') {
            return new Response('threadId required', { status: 400 })
          }
          if (!isRecord(body)) {
            return new Response('invalid run body', { status: 400 })
          }
          const messages = seedMessages(body.messages)
          lastIncomingIds.set(threadId, incomingIds(messages))
          const stream = chat({
            adapter,
            messages,
            threadId,
            runId: stringField(body, 'runId') ?? crypto.randomUUID(),
            middleware: [withPersistence(persistence)],
          })
          for await (const _ of stream) void _
          return Response.json(await inspectBody(request, threadId))
        }

        const params = await chatParamsFromRequestBody(body)
        lastIncomingIds.set(params.threadId, incomingIds(params.messages))
        return toServerSentEventsResponse(
          chat({
            adapter,
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            middleware: [withPersistence(persistence)],
          }),
        )
      },

      GET: async ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('inspect') === '1') {
          return Response.json(
            await inspectBody(request, url.searchParams.get('threadId') ?? ''),
          )
        }
        return reconstructChat(persistenceFor(request), request, {
          authorize: (threadId) => threadId.length > 0,
        })
      },
    },
  },
})
