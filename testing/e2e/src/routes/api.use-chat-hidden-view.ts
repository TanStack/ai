import { createFileRoute } from '@tanstack/react-router'
import {
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Provider-free harness route for a `useChat` view that `<Activity>` hides
 * while a reply streams. Exempt from the aimock policy: it never calls an LLM.
 *
 * - `POST` streams the first half of the reply. The run then waits for
 *   `POST ?action=finish&threadId=…` before it streams the second half.
 * - `GET ?threadId=…` is the mount load of a `persistence: true` client. It
 *   names the run of the thread while that run is in progress.
 * - `GET ?offset=-1&runId=…` replays the log of the run (`joinRun`).
 */

const FIRST_HALF = 'HIDDEN_VIEW the first half,'
const SECOND_HALF = ' and the second half.'

const runsInProgress = new Map<string, { runId: string; finish: () => void }>()

function reply(
  threadId: string,
  runId: string,
  finished: Promise<void>,
): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'TEXT_MESSAGE_START',
      messageId: `assistant-${runId}`,
      role: 'assistant',
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: `assistant-${runId}`,
      delta: FIRST_HALF,
      timestamp: Date.now(),
    } as StreamChunk
    await finished
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: `assistant-${runId}`,
      delta: SECOND_HALF,
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'TEXT_MESSAGE_END',
      messageId: `assistant-${runId}`,
      timestamp: Date.now(),
    } as StreamChunk
    runsInProgress.delete(threadId)
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      timestamp: Date.now(),
      outcome: { type: 'success' },
    } as StreamChunk
  })()
}

export const Route = createFileRoute('/api/use-chat-hidden-view')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('action') === 'finish') {
          const threadId = url.searchParams.get('threadId') ?? ''
          runsInProgress.get(threadId)?.finish()
          return new Response(null, { status: 204 })
        }
        const body: { threadId: string; runId: string } = await request.json()
        let finish = () => {}
        const finished = new Promise<void>((resolve) => (finish = resolve))
        runsInProgress.set(body.threadId, { runId: body.runId, finish })
        return toServerSentEventsResponse(
          reply(body.threadId, body.runId, finished),
          { durability: { adapter: memoryStream(request) } },
        )
      },
      GET: ({ request }) => {
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        const threadId = new URL(request.url).searchParams.get('threadId')
        const run = threadId ? runsInProgress.get(threadId) : undefined
        return Response.json({
          messages: [],
          activeRun: run ? { runId: run.runId } : null,
          interrupts: null,
        })
      },
    },
  },
})
