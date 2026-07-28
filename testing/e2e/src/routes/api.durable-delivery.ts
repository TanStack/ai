import { createFileRoute } from '@tanstack/react-router'
import {
  memoryStream,
  resumeHttpResponse,
  resumeServerSentEventsResponse,
  toHttpResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * A provider-free delivery-durability harness route. It streams a FIXED
 * sequence of AG-UI events through the transport helper's `durability` sink
 * (`memoryStream`), so the delivery e2e can assert disconnect→reconnect→ordered
 * resume and second-tab join deterministically, with no LLM in the loop.
 *
 * - `POST` with no offset → fresh run: produce + append the fixed sequence,
 *   tagging each event with an opaque adapter-owned offset.
 * - `POST` with `Last-Event-ID` → reconnect: replay strictly after the offset
 *   from the log (the fixed sequence is never re-produced).
 * - `GET  ?offset=-1&runId=…` → second-tab join: replay from the start.
 *
 * `?transport=ndjson` switches the wire encoding from SSE to newline-delimited
 * JSON (each durable line is an `{ id, chunk }` envelope). The durability layer
 * — logging, offsets, resume, terminalization — is identical for both.
 */
// Emits bare TEXT_MESSAGE_CONTENT chunks without TEXT_MESSAGE_START/END
// bracketing: this harness deliberately exercises raw chunk delivery + resume,
// not UIMessage reassembly. The durability layer terminalizes on RUN_FINISHED
// (emitted below), which is all resume/join needs.
function fixedRun(threadId: string, runId: string): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    for (let i = 1; i <= 5; i++) {
      yield {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'm',
        model: 'fixed',
        delta: String(i),
        content: String(i),
        timestamp: Date.now(),
      } as StreamChunk
    }
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      model: 'fixed',
      finishReason: 'stop',
      timestamp: Date.now(),
    } as StreamChunk
  })()
}

/**
 * An agent-loop run: one RUN_STARTED/RUN_FINISHED pair PER iteration. The first
 * terminal carries `finishReason: 'tool_calls'` (the model paused to call a
 * tool); the tool result and a second iteration (the real answer) follow, ending
 * on a `'stop'` terminal. This is the shape a tool-calling run takes on the
 * wire, and the case that regressed: a durability sink that ended the log on the
 * FIRST terminal truncated the run at the tool call.
 */
function agentLoopRun(
  threadId: string,
  runId: string,
): AsyncIterable<StreamChunk> {
  return (async function* () {
    const now = () => Date.now()
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: now(),
    } as StreamChunk
    yield {
      type: 'TOOL_CALL_START',
      toolCallId: 'call-1',
      toolCallName: 'rollDice',
      toolName: 'rollDice',
      timestamp: now(),
    } as StreamChunk
    yield {
      type: 'TOOL_CALL_ARGS',
      toolCallId: 'call-1',
      delta: '{"sides":20}',
      timestamp: now(),
    } as StreamChunk
    yield {
      type: 'TOOL_CALL_END',
      toolCallId: 'call-1',
      timestamp: now(),
    } as StreamChunk
    // First per-iteration terminal. A sink that stops here drops everything below.
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      model: 'fixed',
      finishReason: 'tool_calls',
      timestamp: now(),
    } as StreamChunk
    // The tool result and the second iteration must survive the first terminal.
    yield {
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'call-1',
      content: '{"rolls":[14],"total":14}',
      timestamp: now(),
    } as StreamChunk
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: now(),
    } as StreamChunk
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'm2',
      model: 'fixed',
      delta: 'done',
      content: 'done',
      timestamp: now(),
    } as StreamChunk
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      model: 'fixed',
      finishReason: 'stop',
      timestamp: now(),
    } as StreamChunk
  })()
}

function isAgentLoop(request: Request): boolean {
  try {
    return new URL(request.url).searchParams.get('scenario') === 'agent-loop'
  } catch {
    return false
  }
}

function durableRun(request: Request) {
  const url = new URL(request.url)
  const runId = url.searchParams.get('runId') ?? crypto.randomUUID()
  url.searchParams.set('runId', runId)
  // On a reconnect (Last-Event-ID present), memoryStream resolves the real run
  // from the offset itself and ignores this URL runId — so a freshly minted
  // random id here does NOT name the run being served and must not be
  // advertised via X-Run-Id.
  const isResume = request.headers.get('Last-Event-ID') !== null
  return {
    durability: memoryStream(new Request(url, request)),
    runId,
    advertiseRunId: isResume ? undefined : runId,
  }
}

function withRunId(response: Response, runId: string | undefined): Response {
  if (runId !== undefined) response.headers.set('X-Run-Id', runId)
  return response
}

function isNdjson(request: Request): boolean {
  try {
    return new URL(request.url).searchParams.get('transport') === 'ndjson'
  } catch {
    return false
  }
}

/** Build the durable response in the requested wire encoding (SSE or NDJSON). */
function durableResponse(
  request: Request,
  runId: string,
  durability: ReturnType<typeof memoryStream>,
  batch?: number,
): Response {
  const stream = isAgentLoop(request)
    ? agentLoopRun('thread-durable', runId)
    : fixedRun('thread-durable', runId)
  const durabilityOption = { adapter: durability, ...(batch ? { batch } : {}) }
  return isNdjson(request)
    ? toHttpResponse(stream, { durability: durabilityOption })
    : toServerSentEventsResponse(stream, { durability: durabilityOption })
}

export const Route = createFileRoute('/api/durable-delivery')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { durability, runId, advertiseRunId } = durableRun(request)
        return withRunId(
          durableResponse(request, runId, durability, 2),
          advertiseRunId,
        )
      },
      GET: async ({ request }) => {
        // A join replays from the log, so no producer stream is built here.
        const { durability, advertiseRunId } = durableRun(request)
        const response = isNdjson(request)
          ? resumeHttpResponse({ adapter: durability })
          : resumeServerSentEventsResponse({ adapter: durability })
        return withRunId(response, advertiseRunId)
      },
    },
  },
})
