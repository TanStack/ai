import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { AnyTextAdapter, AdapterYieldChunk } from '@tanstack/ai'

/**
 * Provider-free harness for issue #1639: a run restored from an async store
 * that resolves BEFORE `attach()` must still be rejoined.
 *
 * The POST streams the first half of a reply, then holds the producer until
 * the spec calls `GET ?action=release&threadId=…`, and only then streams
 * `REJOIN_OK` and the terminal. The spec releases after the reload, so the
 * second half can only reach the page through `joinRun`. A client abort does
 * not reach this dev server, so the hold cannot key on the disconnect.
 *
 * Exempt from the aimock policy: a fixed AG-UI sequence, never an LLM provider.
 */

const PART_ONE = 'PART_ONE the run is still going. '
const REJOIN_OK = 'REJOIN_OK the run finished after the reload.'
// Cleans up a held run the spec never released.
const RELEASE_FALLBACK_MS = 60_000

// Per-thread gate. `release` may arrive before the POST registers its wait.
const releaseByThread = new Map<string, () => void>()
const releasedThreads = new Set<string>()

function waitForRelease(threadId: string): Promise<void> {
  if (releasedThreads.delete(threadId)) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      releaseByThread.delete(threadId)
      resolve()
    }
    const timer = setTimeout(finish, RELEASE_FALLBACK_MS)
    releaseByThread.set(threadId, finish)
  })
}

function release(threadId: string): void {
  const finish = releaseByThread.get(threadId)
  if (finish) finish()
  else releasedThreads.add(threadId)
}

function createAdapter(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'async-store-rejoin',
    model: 'async-store-rejoin',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    async *chatStream(options): AsyncGenerator<AdapterYieldChunk> {
      const model = 'async-store-rejoin'
      const runId = options.runId ?? 'async-store-rejoin-run'
      const threadId = options.threadId ?? 'async-store-rejoin-thread'
      const messageId = `${runId}-message`

      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: PART_ONE,
        model,
        timestamp: Date.now(),
      }

      await waitForRelease(threadId)

      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: REJOIN_OK,
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model,
        finishReason: 'stop',
        timestamp: Date.now(),
      }
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
}

export const Route = createFileRoute('/api/async-store-rejoin')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const stream = chat({
          adapter: createAdapter(),
          messages: params.messages,
          stream: true,
          threadId: params.threadId,
          runId: params.runId,
        })

        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
        })
      },

      GET: ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('action') === 'release') {
          release(url.searchParams.get('threadId') ?? '')
          return new Response(null, { status: 204 })
        }

        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        return new Response('Not found', { status: 404 })
      },
    },
  },
})
