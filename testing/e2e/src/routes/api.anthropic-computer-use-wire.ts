import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { computerUseTool } from '@tanstack/ai-anthropic/tools'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/**
 * Drives the Anthropic chat adapter with `computerUseTool()`. A custom
 * `fetch` captures the headers of the outgoing request and answers with a
 * short Claude SSE stream, so the companion spec can read the
 * `anthropic-beta` header without an API key.
 */
function endTurnStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_computer_use_wire',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-haiku-4-5',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 0 },
      },
    },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
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

export const Route = createFileRoute('/api/anthropic-computer-use-wire')({
  server: {
    handlers: {
      POST: async () => {
        let anthropicBeta: string | null = null
        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          anthropicBeta = req.headers.get('anthropic-beta')
          return new Response(endTurnStream(), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        const adapter = createAnthropicChat('claude-haiku-4-5', DUMMY_KEY, {
          fetch: capturingFetch,
        })

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'Open the browser.' }],
            tools: [
              computerUseTool({
                type: 'computer_20250124',
                name: 'computer',
                display_width_px: 1024,
                display_height_px: 768,
              }),
            ],
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, anthropicBeta })
      },
    },
  },
})
