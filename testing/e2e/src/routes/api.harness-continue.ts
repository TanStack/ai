import { createFileRoute } from '@tanstack/react-router'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createHarnessHost,
  defineHarness,
  retryTransientErrors,
} from '@tanstack/ai-harness'

/**
 * Wire check for a turn that continues a partial answer.
 *
 * The first model call streams "Hello wor", then the stream sends an
 * `overloaded_error`. `retryTransientErrors()` answers `'continue'`. The
 * second call answers "ld". A custom `fetch` records each request body and
 * answers with a canned stream, so no aimock fixture is needed. aimock can
 * cut a stream, but a cut stream ends without an error event.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'

const start = (id: string) => [
  {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      content: [],
      model: MODEL,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 0 },
    },
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  },
]

const delta = (text: string) => ({
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text },
})

/** Streams some text, then fails in the middle of the stream. */
const FAILED_REPLY = [
  ...start('msg_harness_continue_1'),
  delta('Hello wor'),
  {
    type: 'error',
    error: { type: 'overloaded_error', message: 'Overloaded' },
  },
]

const CONTINUED_REPLY = [
  ...start('msg_harness_continue_2'),
  delta('ld'),
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]

/** The fields of an Anthropic Messages request body that the spec reads. */
interface WireBody {
  messages: Array<{
    role: string
    content: string | Array<{ type: string; text?: string }>
  }>
}

/** The text of one wire message. */
const textOf = (content: WireBody['messages'][number]['content']) =>
  typeof content === 'string'
    ? content
    : content.map((part) => part.text ?? '').join('')

export const Route = createFileRoute('/api/harness-continue')({
  server: {
    handlers: {
      POST: async () => {
        const bodies: Array<WireBody> = []
        const scriptedFetch: typeof fetch = async (input, init) => {
          bodies.push(await new Request(input, init).json())
          const events = bodies.length === 1 ? FAILED_REPLY : CONTINUED_REPLY
          const sse = events
            .map(
              (event) =>
                `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            )
            .join('')
          return new Response(sse, {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        const host = createHarnessHost()
        let text: string
        try {
          const session = await host.open(
            defineHarness({
              name: 'e2e/harness-continue',
              adapter: createAnthropicChat(MODEL, DUMMY_KEY, {
                fetch: scriptedFetch,
              }),
              turn: {
                onModelError: retryTransientErrors({ baseDelayMs: 1 }),
              },
            }),
            { threadId: 'e2e-harness-continue' },
          )
          text = (await session.prompt('[harness-continue] say hello world'))
            .text
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          await host.close()
        }

        return Response.json({
          text,
          requests: bodies.map((body) =>
            body.messages.map((message) => ({
              role: message.role,
              text: textOf(message.content),
            })),
          ),
        })
      },
    },
  },
})
