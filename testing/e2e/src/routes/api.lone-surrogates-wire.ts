import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/** Text with two lone surrogates and one valid pair (an emoji). */
const LONE = 'a\ud800b\udc00c😀'

const textEvents = [
  {
    type: 'message_start',
    message: {
      id: 'msg_lone_surrogates_wire',
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
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]

/**
 * A lone surrogate is invalid on the wire, and Anthropic rejects the whole
 * request. The capturing `fetch` returns the raw request body, so this needs
 * no fixture.
 */
export const Route = createFileRoute('/api/lone-surrogates-wire')({
  server: {
    handlers: {
      POST: async () => {
        const requestBodies: Array<string> = []

        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          requestBodies.push(await req.text())
          const encoder = new TextEncoder()
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              for (const event of textEvents) {
                controller.enqueue(
                  encoder.encode(
                    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                  ),
                )
              }
              controller.close()
            },
          })
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        const adapter = createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
          fetch: capturingFetch,
        })

        try {
          const stream = chat({
            adapter,
            systemPrompts: [LONE],
            messages: [
              { role: 'user', content: LONE },
              {
                role: 'assistant',
                content: null,
                toolCalls: [
                  {
                    id: 'toolu_lone',
                    type: 'function',
                    function: {
                      name: 'lookup',
                      arguments: '{"q":"a\\ud800b"}',
                    },
                  },
                ],
              },
              { role: 'tool', toolCallId: 'toolu_lone', content: LONE },
            ],
            stream: true,
          })
          for await (const _chunk of stream) {
            // drain
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
