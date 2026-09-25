import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Wire-format regression for issue #1247.
 *
 * A provider-free harness run where `TOOL_CALL_START` carries a
 * `parentMessageId` that has not had a `TEXT_MESSAGE_START` yet — the normal
 * AG-UI shape for "call a tool, then explain the result" as one assistant
 * turn. The two `TEXT_MESSAGE_CONTENT` deltas below are the assertion: the
 * bug only surfaces once a *second* delta arrives after the tool-first
 * message's real `TEXT_MESSAGE_START`.
 */
function toolFirstRun(
  threadId: string,
  runId: string,
): AsyncIterable<StreamChunk> {
  const messageId = 'msg-1'
  const toolCallId = 'call-1'
  return (async function* () {
    yield { type: 'RUN_STARTED', threadId, runId, timestamp: Date.now() }
    yield {
      type: 'TOOL_CALL_START',
      toolCallId,
      toolCallName: 'lookupWeather',
      parentMessageId: messageId,
      timestamp: Date.now(),
    }
    yield {
      type: 'TOOL_CALL_ARGS',
      toolCallId,
      delta: '{}',
      timestamp: Date.now(),
    }
    yield { type: 'TOOL_CALL_END', toolCallId, timestamp: Date.now() }
    yield {
      type: 'TOOL_CALL_RESULT',
      messageId: 'tool-1',
      toolCallId,
      role: 'tool',
      content: '{"ok":true}',
      timestamp: Date.now(),
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
      delta: 'Hello, ',
      timestamp: Date.now(),
    }
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId,
      delta: 'world.',
      timestamp: Date.now(),
    }
    yield { type: 'TEXT_MESSAGE_END', messageId, timestamp: Date.now() }
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      timestamp: Date.now(),
      outcome: { type: 'success' },
    }
  })() as AsyncIterable<StreamChunk>
}

export const Route = createFileRoute('/api/tool-first-text-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const threadId =
          typeof body === 'object' && body !== null && 'threadId' in body
            ? String((body as Record<string, unknown>).threadId)
            : 'thread-1'
        const runId = `run-${threadId}`
        return toServerSentEventsResponse(toolFirstRun(threadId, runId))
      },
    },
  },
})
