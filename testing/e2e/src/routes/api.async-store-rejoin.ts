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
 * the client disconnects (the spec reload) plus a short settle, and only then
 * streams `REJOIN_OK` and the terminal. The second half lands strictly after
 * the reload, so the page can only show it by tailing the run with `joinRun`.
 *
 * Exempt from the aimock policy: a fixed AG-UI sequence, never an LLM provider.
 */

const PART_ONE = 'PART_ONE the run is still going. '
const REJOIN_OK = 'REJOIN_OK the run finished after the reload.'
const DISCONNECT_FALLBACK_MS = 10_000
const SETTLE_AFTER_DISCONNECT_MS = 1500

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitForDisconnect(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, DISCONNECT_FALLBACK_MS)
    signal.addEventListener('abort', finish, { once: true })
  })
}

function createAdapter(signal: AbortSignal): AnyTextAdapter {
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

      await waitForDisconnect(signal)
      await delay(SETTLE_AFTER_DISCONNECT_MS)

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
          adapter: createAdapter(request.signal),
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
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        return new Response('Not found', { status: 404 })
      },
    },
  },
})
