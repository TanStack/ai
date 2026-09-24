import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { webSearchTool } from '@tanstack/ai-anthropic/tools'
import { z } from 'zod'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/**
 * Wire-format verification for `claude-opus-5` structured output with tools.
 *
 * `claude-opus-5` is in `ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS`, so
 * `supportsCombinedToolsAndSchema()` is true and the engine forwards the
 * schema into the single streaming Messages call instead of adding a
 * forced-tool-use finalization round-trip. The companion spec asserts the
 * observable consequences on the wire:
 *
 * 1. Exactly one upstream request — no separate `structured_output` call.
 * 2. That request carries `output_config.format` as a `json_schema`.
 * 3. It also carries the `web_search` server tool, so the schema and the
 *    provider tool travel together.
 *
 * Passing `webSearchTool()` to a `claude-opus-5` adapter is the other half of
 * the check: it only compiles when the model's `supports.tools` list is
 * populated, so this route stops type-checking if that list regresses to `[]`.
 *
 * A custom `fetch` captures every outgoing request and answers with a
 * synthetic Claude SSE stream whose final text is schema-shaped JSON, so the
 * run finishes without a real Anthropic key or an aimock fixture — the same
 * approach as `api.anthropic-skills-wire.ts`.
 */

/** Minimal Anthropic Messages stream whose text is the structured payload. */
function makeSyntheticAnthropicStream(
  payload: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_opus_5_combined',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-opus-5',
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
      delta: { type: 'text_delta', text: payload },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 12 },
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

export const Route = createFileRoute('/api/anthropic-opus-5-combined-wire')({
  server: {
    handlers: {
      POST: async () => {
        const capturedRequests: Array<{
          url: string
          body: Record<string, unknown> | null
        }> = []

        /**
         * Records the outgoing request and answers with the synthetic stream,
         * so nothing leaves the process.
         */
        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          let body: Record<string, unknown> | null = null
          try {
            const rawBody = await req.text()
            if (rawBody) {
              body = JSON.parse(rawBody) as Record<string, unknown>
            }
          } catch {
            // Ignore parse errors — body stays null
          }
          capturedRequests.push({ url: req.url, body })

          return new Response(
            makeSyntheticAnthropicStream(
              '{"recommendation":"Fender Stratocaster","price":1299}',
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

        const adapter = createAnthropicChat('claude-opus-5', DUMMY_KEY, {
          fetch: capturingFetch,
        })

        const options = createChatOptions({
          adapter,
          outputSchema: z.object({
            recommendation: z.string(),
            price: z.number(),
          }),
          stream: true,
        })

        try {
          for await (const _ of chat({
            ...options,
            messages: [
              {
                role: 'user',
                content: '[opus5-combined] recommend a guitar as json',
              },
            ],
            tools: [
              webSearchTool({
                name: 'web_search',
                type: 'web_search_20250305',
              }),
            ],
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
              capturedRequests,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ ok: true, capturedRequests }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
