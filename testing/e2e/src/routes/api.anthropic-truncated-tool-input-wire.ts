import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
} from '@tanstack/ai'
import { StreamProcessor, uiMessagesToWire } from '@tanstack/ai/client'
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

const PROMPTS = [
  '[truncated-tool-input-wire-1] weather in Paris',
  '[truncated-tool-input-wire-2] try again',
]

function toSse(events: Array<{ type: string }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(
            `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          ),
        )
      }
      controller.close()
    },
  })
}

const messageStart = {
  type: 'message_start',
  message: {
    id: 'msg_truncated_tool_input_wire',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'claude-sonnet-4-5',
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 5, output_tokens: 0 },
  },
}

/** The stream ends mid `input_json_delta`, so the arguments are not valid JSON. */
const truncatedToolCallEvents = [
  messageStart,
  {
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'tool_use',
      id: 'toolu_truncated',
      name: 'lookup_weather',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'input_json_delta', partial_json: '{"location": "Par' },
  },
]

const textEvents = [
  messageStart,
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'It is sunny in Paris.' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 6 },
  },
  { type: 'message_stop' },
]

/**
 * Issue #1582: turn 1 stops mid tool call. `finalizeStream()` marks the call
 * `input-complete` with its partial arguments, and turn 2 replays it. The
 * capturing `fetch` answers with synthetic Claude streams, so this needs no
 * fixture. The companion spec reads `requestBodies[1]`.
 */
export const Route = createFileRoute(
  '/api/anthropic-truncated-tool-input-wire',
)({
  server: {
    handlers: {
      POST: async () => {
        const requestBodies: Array<unknown> = []

        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          const rawBody = await req.text()
          requestBodies.push(rawBody ? JSON.parse(rawBody) : null)

          return new Response(
            toSse(
              requestBodies.length === 1 ? truncatedToolCallEvents : textEvents,
            ),
            {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
              },
            },
          )
        }

        const adapter = createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
          fetch: capturingFetch,
        })
        const processor = new StreamProcessor({})

        try {
          for (const [index, prompt] of PROMPTS.entries()) {
            processor.addUserMessage(prompt)
            // `JSON.parse(JSON.stringify(...))` stands in for the HTTP hop.
            const params = await chatParamsFromRequestBody({
              threadId: 'anthropic-truncated-tool-input-wire',
              runId: `anthropic-truncated-tool-input-wire-${index + 1}`,
              messages: JSON.parse(
                JSON.stringify(uiMessagesToWire(processor.getMessages())),
              ),
              tools: [],
              context: [],
            })

            const stream = chat({
              ...createChatOptions({ adapter }),
              messages: params.messages,
              stream: true,
            })
            for await (const chunk of stream) {
              processor.processChunk(chunk)
            }
            processor.finalizeStream()
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, requestBodies })
      },
    },
  },
})
