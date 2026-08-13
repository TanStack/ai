import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { codeExecutionTool } from '@tanstack/ai-anthropic/tools'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/**
 * Drives the Anthropic chat adapter with a `codeExecutionTool` carrying a
 * hosted skill. A custom `fetch` implementation intercepts the outgoing
 * request before it reaches aimock, capturing both the raw request body
 * (which includes `container.skills`) and the HTTP headers (which include
 * `anthropic-beta`).
 *
 * The captured data is returned as JSON so the companion spec can assert:
 * 1. `capturedRequest.body.container.skills` contains the skill reference.
 * 2. `capturedRequest.headers['anthropic-beta']` includes both
 *    `code-execution-2025-08-25` and `skills-2025-10-02`.
 *
 * The fake fetch returns a minimal synthetic Claude SSE response so the
 * `chat()` call can finish without a real Anthropic API key or a live
 * aimock fixture.
 */

/** Minimal Anthropic Messages streaming response (end_turn, no content). */
function makeSyntheticAnthropicStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_wire_test',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-sonnet-4-5',
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
      delta: { type: 'text_delta', text: 'ok' },
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

export const Route = createFileRoute('/api/anthropic-skills-wire')({
  server: {
    handlers: {
      POST: async () => {
        let capturedRequest: {
          url: string
          headers: Record<string, string>
          body: unknown
        } | null = null

        // Custom fetch that captures the outgoing request and returns a
        // synthetic Anthropic SSE response without touching a real server.
        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          const url = req.url
          const headers: Record<string, string> = {}
          req.headers.forEach((value, key) => {
            headers[key] = value
          })
          let body: unknown = null
          try {
            const rawBody = await req.text()
            if (rawBody) {
              body = JSON.parse(rawBody)
            }
          } catch {
            // Ignore parse errors — body stays null
          }
          capturedRequest = { url, headers, body }

          return new Response(makeSyntheticAnthropicStream(), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          })
        }

        const adapter = createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
          fetch: capturingFetch,
        })

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content: '[skills-wire] test code execution with skill',
              },
            ],
            tools: [
              codeExecutionTool(
                { type: 'code_execution_20250825', name: 'code_execution' },
                {
                  skills: [
                    {
                      type: 'anthropic',
                      skill_id: 'pptx',
                      version: 'latest',
                    },
                  ],
                },
              ),
            ],
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ ok: true, capturedRequest }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
