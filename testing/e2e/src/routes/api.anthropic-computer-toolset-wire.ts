import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { computerUseTool } from '@tanstack/ai-anthropic/tools'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/**
 * Drives one computer toolset loop on `claude-opus-5-5`. A custom `fetch`
 * captures each outgoing request. The first answer has two toolset calls
 * (`left_click` and `screenshot`). The second answer ends the turn.
 *
 * The companion spec reads the captured requests and the inputs that
 * `execute` got, so it can check the toolset wire format without an API key.
 */
function sseStream(events: Array<{ type: string }>) {
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
    id: 'msg_computer_toolset_wire',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'claude-opus-5-5',
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 5, output_tokens: 0 },
  },
}

const end = (stopReason: string) => [
  {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]

const toolsetCalls = [
  messageStart,
  {
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'tool_use',
      id: 'toolu_click',
      name: 'left_click',
      toolset_name: 'computer',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: {
      type: 'input_json_delta',
      partial_json: '{"coordinate":[500,300]}',
    },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'tool_use',
      id: 'toolu_shot',
      name: 'screenshot',
      toolset_name: 'computer',
      input: {},
    },
  },
  { type: 'content_block_stop', index: 1 },
  ...end('tool_use'),
]

export const Route = createFileRoute('/api/anthropic-computer-toolset-wire')({
  server: {
    handlers: {
      POST: async () => {
        const requests: Array<{ anthropicBeta: string | null; body: unknown }> =
          []
        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          const rawBody = await req.text()
          requests.push({
            anthropicBeta: req.headers.get('anthropic-beta'),
            body: rawBody ? JSON.parse(rawBody) : null,
          })
          const events =
            requests.length === 1
              ? toolsetCalls
              : [messageStart, ...end('end_turn')]
          return new Response(sseStream(events), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        const calls: Array<unknown> = []
        const computer = {
          ...computerUseTool({
            type: 'computer_toolset_20260801',
            configs: { zoom: { enabled: false } },
          }),
          execute: (input: { action: string }) => {
            calls.push(input)
            if (input.action !== 'screenshot') return 'OK'
            return [
              {
                type: 'image' as const,
                source: {
                  type: 'data' as const,
                  value: 'AAAA',
                  mimeType: 'image/png',
                },
              },
            ]
          },
        }

        const adapter = createAnthropicChat('claude-opus-5-5', DUMMY_KEY, {
          fetch: capturingFetch,
        })

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'Click the button.' }],
            tools: [computer],
            toolExecution: 'sequential',
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, calls, requests })
      },
    },
  },
})
