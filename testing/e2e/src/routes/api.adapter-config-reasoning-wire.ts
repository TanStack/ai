import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import type { ModelReasoning } from '@tanstack/ai'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/** A gateway id that the Anthropic adapter does not list. */
const GATEWAY_MODEL = 'anthropic/claude-sonnet-4.6'

/** The reasoning data of its catalog record (budget thinking). */
const RECORD_REASONING: ModelReasoning = {
  map: { minimal: null, xhigh: null, max: 'max' },
  budget: true,
}

/**
 * Wire-format verification for the `reasoning` config of an adapter.
 *
 * The route runs `chat({ reasoning: 'high' })` two times on a model id that
 * the Anthropic adapter does not list: once with the record's reasoning data
 * in the config, once with `reasoning: false`. A custom `fetch` records each
 * Messages request and answers with a synthetic Claude stream, the same
 * approach as `api.anthropic-sonnet-5-5-wire.ts`.
 */
function makeSyntheticAnthropicStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_config_reasoning_wire',
        type: 'message',
        role: 'assistant',
        content: [],
        model: GATEWAY_MODEL,
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

export const Route = createFileRoute('/api/adapter-config-reasoning-wire')({
  server: {
    handlers: {
      POST: async () => {
        const capturedRequests: Array<Record<string, unknown> | null> = []

        /** Records the outgoing request and answers with the synthetic stream. */
        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          const rawBody = await req.text()
          capturedRequests.push(
            rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null,
          )
          return new Response(makeSyntheticAnthropicStream(), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          })
        }

        try {
          for await (const _ of chat({
            adapter: createAnthropicChat(GATEWAY_MODEL, DUMMY_KEY, {
              fetch: capturingFetch,
              reasoning: RECORD_REASONING,
            }),
            messages: [{ role: 'user', content: '[config-reasoning] plan it' }],
            reasoning: 'high',
          })) {
            // Drain the stream.
          }
          for await (const _ of chat({
            adapter: createAnthropicChat(GATEWAY_MODEL, DUMMY_KEY, {
              fetch: capturingFetch,
              reasoning: false,
            }),
            messages: [{ role: 'user', content: '[config-reasoning] plan it' }],
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            capturedRequests,
          })
        }

        return Response.json({ ok: true, capturedRequests })
      },
    },
  },
})
