import { createFileRoute } from '@tanstack/react-router'

/**
 * A provider-free AG-UI producer that sends only the *_CHUNK shorthand
 * (issue #1531). It writes the SSE bytes itself. A continuation chunk
 * carries no id, as the spec allows.
 *
 * `?case=turn` streams reasoning, a tool call with its result, and text.
 * `?case=error` is the issue repro: one text chunk with error metadata, then
 * RUN_ERROR.
 */
function sse(events: Array<Record<string, unknown>>): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`)
  return new Response(body.join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

const threadId = 'foreign-chunk-events'
const runId = 'run-1'

const turn = [
  { type: 'RUN_STARTED', threadId, runId },
  {
    type: 'REASONING_MESSAGE_CHUNK',
    messageId: 'think-1',
    delta: 'Look up ',
  },
  { type: 'REASONING_MESSAGE_CHUNK', delta: 'the weather.' },
  {
    type: 'TOOL_CALL_CHUNK',
    toolCallId: 'call-weather',
    toolCallName: 'get_weather',
    parentMessageId: 'msg-chunked',
    delta: '{"city":',
  },
  { type: 'TOOL_CALL_CHUNK', delta: '"Kyiv"}' },
  {
    type: 'TOOL_CALL_RESULT',
    messageId: 'result-1',
    toolCallId: 'call-weather',
    content: '"sunny"',
  },
  { type: 'TEXT_MESSAGE_CHUNK', messageId: 'msg-chunked', delta: 'It is ' },
  { type: 'TEXT_MESSAGE_CHUNK', delta: 'sunny in Kyiv.' },
  { type: 'RUN_FINISHED', threadId, runId },
]

const error = [
  { type: 'RUN_STARTED', threadId, runId },
  {
    type: 'TEXT_MESSAGE_CHUNK',
    messageId: 'msg-error',
    delta: 'the run failed',
    metadata: { error: 'upstream timeout' },
  },
  { type: 'RUN_ERROR', message: 'upstream timeout' },
]

export const Route = createFileRoute('/api/foreign-chunk-events')({
  server: {
    handlers: {
      POST: ({ request }) => {
        const scenario = new URL(request.url).searchParams.get('case')
        return sse(scenario === 'error' ? error : turn)
      },
    },
  },
})
