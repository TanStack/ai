import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type {
  AnyTextAdapter,
  AdapterYieldChunk,
  StreamChunk,
} from '@tanstack/ai'

/**
 * Provider-free harness for AG-UI activity (issue #1286).
 *
 * Live mode (`POST /api/activity-test`) runs `chat()` with a fixed adapter that
 * yields ACTIVITY_SNAPSHOT then ACTIVITY_DELTA, then assistant text. The second
 * turn inspects the inbound body: activity must not be sent as model input.
 *
 * Snapshot mode (`?mode=snapshot`) yields a MESSAGES_SNAPSHOT that already
 * contains an ActivityMessage, so the client must hydrate `role: 'activity'`
 * instead of rewriting it to an empty assistant.
 *
 * Exempt from the aimock policy: a fixed AG-UI sequence, never an LLM provider.
 */

const ACTIVITY_ID = 'act-e2e-1'
const ACTIVITY_NEEDLE = 'e2e-activity-needle'
const ACTIVITY_FOUND = 'ACTIVITY_FOUND cats'
const ACTIVITY_CLEAN = 'ACTIVITY_CLEAN'
const ACTIVITY_LEAK = 'ACTIVITY_LEAK'

const adapter: AnyTextAdapter = {
  kind: 'text',
  name: 'activity-test',
  model: 'activity-test',
  '~types': {
    providerOptions: {},
    inputModalities: ['text'],
    messageMetadataByModality: {},
    toolCapabilities: [],
    toolCallMetadata: undefined,
    systemPromptMetadata: undefined,
  },
  async *chatStream(options): AsyncGenerator<AdapterYieldChunk> {
    const runId = options.runId ?? 'activity-test-run'
    const threadId = options.threadId ?? 'activity-test-thread'
    const userTurns = options.messages.filter(
      (message) => message.role === 'user',
    ).length
    if (userTurns > 1) {
      yield* textRun(threadId, runId, 'asst-clean', ACTIVITY_CLEAN)
      return
    }
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    }
    yield {
      type: 'ACTIVITY_SNAPSHOT',
      messageId: ACTIVITY_ID,
      activityType: 'SEARCH',
      content: { query: ACTIVITY_NEEDLE, status: 'running' },
      timestamp: Date.now(),
    }
    yield {
      type: 'ACTIVITY_DELTA',
      messageId: ACTIVITY_ID,
      activityType: 'SEARCH',
      patch: [
        { op: 'replace', path: '/status', value: 'done' },
        { op: 'add', path: '/hits', value: 3 },
      ],
      timestamp: Date.now(),
    }
    yield* textRun(threadId, runId, 'asst-found', ACTIVITY_FOUND, false)
  },
  structuredOutput: async () => ({ data: {}, rawText: '{}' }),
}

function inboundLeakedActivity(
  messages: Awaited<ReturnType<typeof chatParamsFromRequestBody>>['messages'],
): boolean {
  return messages.some((message) => {
    if (message.role === 'activity') return true
    if ('id' in message && message.id === ACTIVITY_ID) return true
    return JSON.stringify(message).includes(ACTIVITY_NEEDLE)
  })
}

async function* textRun(
  threadId: string,
  runId: string,
  messageId: string,
  text: string,
  includeStart = true,
): AsyncGenerator<AdapterYieldChunk> {
  if (includeStart) {
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    }
  }
  yield {
    type: 'TEXT_MESSAGE_START',
    messageId,
    role: 'assistant',
    timestamp: Date.now(),
  }
  yield {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId,
    delta: text,
    timestamp: Date.now(),
  }
  yield {
    type: 'TEXT_MESSAGE_END',
    messageId,
    timestamp: Date.now(),
  }
  yield {
    type: 'RUN_FINISHED',
    threadId,
    runId,
    timestamp: Date.now(),
  }
}

function snapshotRun(
  threadId: string,
  runId: string,
): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    } satisfies StreamChunk
    yield {
      type: 'MESSAGES_SNAPSHOT',
      timestamp: Date.now(),
      messages: [
        { id: 'u1', role: 'user', content: 'search' },
        {
          id: ACTIVITY_ID,
          role: 'activity',
          activityType: 'SEARCH',
          content: { query: ACTIVITY_NEEDLE, status: 'done', hits: 3 },
        },
        { id: 'a1', role: 'assistant', content: ACTIVITY_FOUND },
      ],
    } satisfies StreamChunk
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      timestamp: Date.now(),
    } satisfies StreamChunk
  })()
}

function leakRun(threadId: string, runId: string): AsyncIterable<StreamChunk> {
  return textRun(threadId, runId, 'asst-leak', ACTIVITY_LEAK)
}

export const Route = createFileRoute('/api/activity-test')({
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

        const snapshot =
          new URL(request.url).searchParams.get('mode') === 'snapshot'
        if (snapshot) {
          return toServerSentEventsResponse(
            snapshotRun(params.threadId, params.runId),
          )
        }

        if (inboundLeakedActivity(params.messages)) {
          return toServerSentEventsResponse(
            leakRun(params.threadId, params.runId),
          )
        }

        const stream = chat({
          adapter,
          messages: params.messages,
          stream: true,
          threadId: params.threadId,
          runId: params.runId,
          ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
        })
        return toServerSentEventsResponse(stream)
      },
    },
  },
})
