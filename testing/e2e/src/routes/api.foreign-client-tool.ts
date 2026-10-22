import { createFileRoute } from '@tanstack/react-router'

/**
 * A provider-free AG-UI producer that is not TanStack AI (issue #1464). It
 * writes the SSE bytes itself, the way Pydantic AI's `AGUIAdapter` does.
 *
 * Turn 1 calls the frontend tool `ping` and ends the run with the call
 * unanswered. Per the AG-UI spec that is a success outcome, not an interrupt.
 *
 * Turn 2 answers once the request history carries the `ping` tool message.
 */
const TOOL_CALL_ID = 'call-ping-1'

function sse(events: Array<Record<string, unknown>>): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`)
  return new Response(body.join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function toolResultContent(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('messages' in body)) {
    return undefined
  }
  const messages: unknown = body.messages
  if (!Array.isArray(messages)) return undefined
  for (const message of messages) {
    if (
      typeof message === 'object' &&
      message !== null &&
      'role' in message &&
      message.role === 'tool' &&
      'toolCallId' in message &&
      message.toolCallId === TOOL_CALL_ID &&
      'content' in message &&
      typeof message.content === 'string'
    ) {
      return message.content
    }
  }
  return undefined
}

export const Route = createFileRoute('/api/foreign-client-tool')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const threadId = 'foreign-client-tool'
        const result = toolResultContent(body)

        if (result === undefined) {
          const runId = 'run-1'
          return sse([
            { type: 'RUN_STARTED', threadId, runId },
            {
              type: 'TOOL_CALL_START',
              toolCallId: TOOL_CALL_ID,
              toolCallName: 'ping',
            },
            { type: 'TOOL_CALL_ARGS', toolCallId: TOOL_CALL_ID, delta: '' },
            { type: 'TOOL_CALL_END', toolCallId: TOOL_CALL_ID },
            {
              type: 'RUN_FINISHED',
              threadId,
              runId,
              outcome: { type: 'success' },
            },
          ])
        }

        const runId = 'run-2'
        return sse([
          { type: 'RUN_STARTED', threadId, runId },
          {
            type: 'TEXT_MESSAGE_START',
            messageId: 'answer',
            role: 'assistant',
          },
          {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: 'answer',
            delta: `ping returned ${result}`,
          },
          { type: 'TEXT_MESSAGE_END', messageId: 'answer' },
          { type: 'RUN_FINISHED', threadId, runId },
        ])
      },
    },
  },
})
