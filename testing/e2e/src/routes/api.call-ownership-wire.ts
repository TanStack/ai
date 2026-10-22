import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Wire-format regression for issue #1533.
 *
 * Public agent-loop order: one `RUN_STARTED`, then each later model call
 * follows a `tool_calls` `RUN_FINISHED` with no new `RUN_STARTED`. Reasoning
 * arrives before the call's `TEXT_MESSAGE_START`. The second call is tools
 * only and names a message id the client has not seen yet.
 */
function callOwnershipRun(
  threadId: string,
  runId: string,
): AsyncIterable<StreamChunk> {
  const now = Date.now()
  return (async function* () {
    yield { type: 'RUN_STARTED', threadId, runId, timestamp: now }
    yield { type: 'STEP_STARTED', stepName: 'step-a', timestamp: now }
    yield {
      type: 'REASONING_MESSAGE_CONTENT',
      messageId: 'rs_A',
      delta: 'think A',
      timestamp: now,
    }
    yield {
      type: 'TEXT_MESSAGE_START',
      messageId: 'msg-1',
      role: 'assistant',
      timestamp: now,
    }
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'msg-1',
      delta: 'hello',
      timestamp: now,
    }
    yield {
      type: 'TOOL_CALL_START',
      toolCallId: 'call_S',
      toolCallName: 'search',
      parentMessageId: 'msg-1',
      timestamp: now,
    }
    yield {
      type: 'TOOL_CALL_ARGS',
      toolCallId: 'call_S',
      delta: '{}',
      timestamp: now,
    }
    yield { type: 'TOOL_CALL_END', toolCallId: 'call_S', timestamp: now }
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      finishReason: 'tool_calls',
      timestamp: now,
    }
    yield {
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'call_S',
      content: '{"ok":true}',
      messageId: 'result-call_S',
      timestamp: now,
    }
    yield {
      type: 'TOOL_CALL_START',
      toolCallId: 'call_G',
      toolCallName: 'get',
      parentMessageId: 'msg-2',
      timestamp: now,
    }
    yield {
      type: 'TOOL_CALL_ARGS',
      toolCallId: 'call_G',
      delta: '{}',
      timestamp: now,
    }
    yield { type: 'TOOL_CALL_END', toolCallId: 'call_G', timestamp: now }
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId: 'run-2',
      finishReason: 'tool_calls',
      timestamp: now,
    }
    yield {
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'call_G',
      content: '{"ok":true}',
      messageId: 'result-call_G',
      timestamp: now,
    }
    yield { type: 'STEP_STARTED', stepName: 'step-b', timestamp: now }
    yield {
      type: 'REASONING_MESSAGE_CONTENT',
      messageId: 'rs_B',
      delta: 'think B',
      timestamp: now,
    }
    yield {
      type: 'TEXT_MESSAGE_START',
      messageId: 'msg-3',
      role: 'assistant',
      timestamp: now,
    }
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'msg-3',
      delta: 'bye',
      timestamp: now,
    }
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId: 'run-3',
      finishReason: 'stop',
      timestamp: now,
    }
  })() as AsyncIterable<StreamChunk>
}

export const Route = createFileRoute('/api/call-ownership-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const threadId =
          typeof body === 'object' && body !== null && 'threadId' in body
            ? String((body as Record<string, unknown>).threadId)
            : 'thread-1'
        return toServerSentEventsResponse(
          callOwnershipRun(threadId, `run-${threadId}`),
        )
      },
    },
  },
})
