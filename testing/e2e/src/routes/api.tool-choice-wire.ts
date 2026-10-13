import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { getGuitars } from '@/lib/tools'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/** Models the spec drives through this route. */
const WIRE_MODELS = ['claude-sonnet-4-5', 'claude-opus-5-5'] as const
type WireModel = (typeof WIRE_MODELS)[number]

/** Reads `model` from the request body. Defaults to `claude-sonnet-4-5`. */
async function readModel(request: Request): Promise<WireModel> {
  const body: unknown = await request.json().catch(() => null)
  const model =
    body && typeof body === 'object' && 'model' in body ? body.model : null
  return WIRE_MODELS.find((known) => known === model) ?? 'claude-sonnet-4-5'
}

/**
 * Wire-format verification for `chat({ toolChoice })` on Anthropic. POST
 * `{ model }` to pick the model.
 *
 * aimock stores Anthropic requests in its journal in OpenAI shape and drops
 * `tool_choice`, so the journal cannot show it. A custom `fetch` captures the
 * outgoing request and answers with a synthetic Claude SSE stream, the same
 * approach as `api.anthropic-opus-5-combined-wire.ts`. The stream has no
 * tool call, so the run makes one request.
 */

/** Minimal Anthropic Messages stream with one text block. */
function makeSyntheticAnthropicStream(
  model: WireModel,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_tool_choice_wire',
        type: 'message',
        role: 'assistant',
        content: [],
        model,
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
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Done.' },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 2 },
    },
    { type: 'message_stop' },
  ]

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

export const Route = createFileRoute('/api/tool-choice-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const model = await readModel(request)
        const capturedBodies: Array<unknown> = []

        /** Records the outgoing request and answers with the synthetic stream. */
        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          capturedBodies.push(await req.json())
          return new Response(makeSyntheticAnthropicStream(model), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          })
        }

        try {
          for await (const _ of chat({
            adapter: createAnthropicChat(model, DUMMY_KEY, {
              fetch: capturingFetch,
            }),
            messages: [
              {
                role: 'user',
                content: '[toolchoice] what guitars do you have in stock',
              },
            ],
            tools: [getGuitars],
            toolChoice: { type: 'tool', name: 'getGuitars' },
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            capturedBodies,
          })
        }

        return Response.json({ ok: true, capturedBodies })
      },
    },
  },
})
