import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import {
  approvalDecisionActivities,
  approvalId,
  buildApprovalActivity,
} from '@tanstack/ai-sandbox'
import { deployProgress } from '@/lib/activity-types'
import type {
  AnyTextAdapter,
  AdapterYieldChunk,
  ChatMiddleware,
  StreamChunk,
  Tool,
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
 * Persist mode (`?mode=persist`) drains `chat()` through `withPersistence`
 * and GET `/api/activity-test?threadId=` returns `reconstructChat`.
 * `?mode=persist-middleware` also adds an activity from middleware `onChunk`.
 * `?mode=persist-error` fails the run after the activity (issue #1804).
 *
 * Persist-live mode (`?mode=persist-live`) streams `chat()` through
 * `withPersistence` and a `memoryStream` log, for a `persistence: true` page:
 *
 * - `[activity] deploy` calls the `deploy` tool. The tool emits step 1 of a
 *   typed `deploy.progress` row, waits for `POST ?action=finish&threadId=`,
 *   then emits step 2 with the same id.
 * - `[activity] approval` sends a pending `sandbox.approval` row. The page
 *   answers with `respondToSandboxApproval`. The run after that carries the
 *   decided row, so the engine gives the decision to the adapter in
 *   `options.approvals`. The adapter then sets that row to `granted`.
 *
 * GET with `?offset=-1&runId=` replays a persist-live run (`joinRun`).
 *
 * Exempt from the aimock policy: a fixed AG-UI sequence, never an LLM provider.
 */

const ACTIVITY_ID = 'act-e2e-1'
const MIDDLEWARE_ACTIVITY_ID = 'act-e2e-middleware'
const ACTIVITY_NEEDLE = 'e2e-activity-needle'
const ACTIVITY_FOUND = 'ACTIVITY_FOUND cats'
const ACTIVITY_CLEAN = 'ACTIVITY_CLEAN'
const ACTIVITY_LEAK = 'ACTIVITY_LEAK'
const DEPLOY_TEXT = '[activity] deploy'
const APPROVAL_TEXT = '[activity] approval'
const DEPLOY_ACTIVITY_ID = 'act-e2e-deploy'
const DEPLOY_CALL_ID = 'call-e2e-deploy'
const APPROVAL_PROVIDER = 'activity-test'
const APPROVAL_ID = approvalId({
  provider: APPROVAL_PROVIDER,
  kind: 'command',
  target: 'deploy',
})

const activityPersistence = memoryPersistence()

// The `deploy` tool of each thread waits here after step 1, until the spec
// sends `POST ?action=finish&threadId=`.
// ponytail: a gate that the spec never opens keeps its run open for the life
// of the test server.
const deployGates = new Map<string, () => void>()

const deployTool: Tool = {
  name: 'deploy',
  description: 'Deploy in two steps.',
  execute: async (_args, context) => {
    const threadId = context?.threadId ?? ''
    context?.emitActivity?.(deployProgress, DEPLOY_ACTIVITY_ID, {
      step: 1,
      total: 2,
    })
    await new Promise<void>((resolve) => deployGates.set(threadId, resolve))
    deployGates.delete(threadId)
    context?.emitActivity?.(deployProgress, DEPLOY_ACTIVITY_ID, {
      step: 2,
      total: 2,
    })
    return { deployed: true }
  },
}

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
    const userMessages = options.messages.filter(
      (message) => message.role === 'user',
    )
    switch (userMessages.at(-1)?.content) {
      case DEPLOY_TEXT:
        // The second model call has the tool result. It ends the run.
        yield* options.messages.at(-1)?.role === 'tool'
          ? textRun(threadId, runId, 'asst-deploy', 'DEPLOY_DONE')
          : deployCall(threadId, runId)
        return
      case APPROVAL_TEXT:
        // The run after `respondToSandboxApproval` has the decision here.
        yield* options.approvals?.has(APPROVAL_ID)
          ? decisionRun(threadId, runId, options.approvals)
          : approvalRun(threadId, runId)
        return
    }
    if (userMessages.length > 1) {
      yield* textRun(threadId, runId, 'asst-clean', ACTIVITY_CLEAN)
      return
    }
    yield {
      type: EventType.RUN_STARTED,
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
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      timestamp: Date.now(),
    }
  }
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: text,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.RUN_FINISHED,
    threadId,
    runId,
    timestamp: Date.now(),
  }
}

/** `[activity] deploy`, first model call: call the `deploy` tool. */
async function* deployCall(
  threadId: string,
  runId: string,
): AsyncGenerator<AdapterYieldChunk> {
  yield {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId: DEPLOY_CALL_ID,
    toolCallName: 'deploy',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: DEPLOY_CALL_ID,
    delta: '{}',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TOOL_CALL_END,
    toolCallId: DEPLOY_CALL_ID,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.RUN_FINISHED,
    threadId,
    runId,
    finishReason: 'tool_calls',
    timestamp: Date.now(),
  }
}

/** `[activity] approval`: an action waits for a decision, so send a pending row. */
async function* approvalRun(
  threadId: string,
  runId: string,
): AsyncGenerator<AdapterYieldChunk> {
  yield {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    timestamp: Date.now(),
  }
  yield buildApprovalActivity({
    approvalId: APPROVAL_ID,
    title: 'Approve deploy',
    threadId,
    runId,
  })
  yield* textRun(threadId, runId, 'asst-approval', 'APPROVAL_PENDING', false)
}

/**
 * The run after `respondToSandboxApproval`. The request carries the decided
 * row, and the engine turns it into `options.approvals`. Like a harness
 * adapter, this sends the decision deltas right after RUN_STARTED.
 */
async function* decisionRun(
  threadId: string,
  runId: string,
  approvals: ReadonlyMap<string, boolean>,
): AsyncGenerator<AdapterYieldChunk> {
  yield {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    timestamp: Date.now(),
  }
  yield* approvalDecisionActivities(approvals, {
    provider: APPROVAL_PROVIDER,
    threadId,
    runId,
  })
  yield* textRun(threadId, runId, 'asst-approve', 'APPROVAL_GRANTED', false)
}

function snapshotRun(
  threadId: string,
  runId: string,
): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      timestamp: Date.now(),
    } satisfies StreamChunk
    yield {
      type: EventType.MESSAGES_SNAPSHOT,
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
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      timestamp: Date.now(),
    } satisfies StreamChunk
  })()
}

function leakRun(threadId: string, runId: string): AsyncIterable<StreamChunk> {
  return textRun(threadId, runId, 'asst-leak', ACTIVITY_LEAK)
}

function stringField(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null || !(key in body)) {
    return undefined
  }
  const value: unknown = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

/** Adds its own activity card before the assistant text (issue #1803). */
const middlewareActivity: ChatMiddleware = {
  name: 'middleware-activity',
  onChunk(_ctx, chunk) {
    if (chunk.type !== EventType.TEXT_MESSAGE_START) return [chunk]
    return [
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: MIDDLEWARE_ACTIVITY_ID,
        activityType: 'NOTICE',
        content: { text: 'from middleware' },
        timestamp: Date.now(),
      },
      chunk,
    ]
  },
}

/** Fails the run after the activity, before the assistant text (issue #1804). */
const failAfterActivity: ChatMiddleware = {
  name: 'fail-after-activity',
  onChunk(_ctx, chunk) {
    if (chunk.type === EventType.TEXT_MESSAGE_START) {
      throw new Error('provider failed')
    }
  },
}

const persistMiddleware: Record<string, Array<ChatMiddleware> | undefined> = {
  persist: [],
  'persist-middleware': [middlewareActivity],
  'persist-error': [failAfterActivity],
}

async function persistActivity(
  threadId: string,
  runId: string,
  extra: Array<ChatMiddleware>,
) {
  const stream = chat({
    adapter,
    messages: [{ role: 'user', content: 'search' }],
    stream: true,
    threadId,
    runId,
    middleware: [withPersistence(activityPersistence), ...extra],
  })
  try {
    for await (const _ of stream) void _
  } catch {
    // persist-error fails the run on purpose.
  }
  return { threadId, runId }
}

export const Route = createFileRoute('/api/activity-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('action') === 'finish') {
          deployGates.get(url.searchParams.get('threadId') ?? '')?.()
          return new Response(null, { status: 204 })
        }
        const mode = url.searchParams.get('mode')
        const extra = mode ? persistMiddleware[mode] : undefined
        if (extra) {
          const body: unknown = await request.json()
          const threadId = stringField(body, 'threadId') ?? crypto.randomUUID()
          const runId = stringField(body, 'runId') ?? crypto.randomUUID()
          return Response.json(await persistActivity(threadId, runId, extra))
        }

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        if (mode === 'snapshot') {
          return toServerSentEventsResponse(
            snapshotRun(params.threadId, params.runId),
          )
        }

        if (mode === 'persist-live') {
          const stream = chat({
            adapter,
            messages: params.messages,
            tools: [deployTool],
            stream: true,
            threadId: params.threadId,
            runId: params.runId,
            middleware: [withPersistence(activityPersistence)],
          })
          return toServerSentEventsResponse(stream, {
            durability: { adapter: memoryStream(request) },
          })
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
      GET: ({ request }) => {
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        return reconstructChat(activityPersistence, request, {
          authorize: (threadId) => threadId.length > 0,
        })
      },
    },
  },
})
