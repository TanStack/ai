import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { webSearchTool } from '@tanstack/ai-anthropic/tools'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/**
 * Wire-format verification for `claude-sonnet-5-5` model options.
 *
 * The model sync added `claude-sonnet-5-5` with the sampling options and
 * without `output_config`, so `output_config.effort` did not type-check while
 * `temperature` did (the API rejects non-default sampling values with a 400).
 * This route only compiles when the model accepts `output_config`, and the
 * companion spec asserts that the effort reaches the Messages request.
 *
 * A custom `fetch` captures the outgoing request and answers with a synthetic
 * Claude SSE stream, so the run finishes without a real Anthropic key or an
 * aimock fixture, the same approach as `api.anthropic-opus-5-combined-wire.ts`.
 */

/** Minimal Anthropic Messages stream with one text block. */
function makeSyntheticAnthropicStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_sonnet_5_5_wire',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-sonnet-5-5',
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

export const Route = createFileRoute('/api/anthropic-sonnet-5-5-wire')({
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
            adapter: createAnthropicChat('claude-sonnet-5-5', DUMMY_KEY, {
              fetch: capturingFetch,
            }),
            messages: [
              { role: 'user', content: '[sonnet-5-5] plan a short trip' },
            ],
            tools: [
              webSearchTool({
                name: 'web_search',
                type: 'web_search_20250305',
              }),
            ],
            modelOptions: {
              output_config: { effort: 'medium' },
              max_tokens: 1024,
            },
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
