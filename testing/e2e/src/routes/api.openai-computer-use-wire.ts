import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { computerUseTool } from '@tanstack/ai-openai/tools'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'
const SCREENSHOT = 'iVBORw0KGgo='

const safetyCheck = {
  id: 'sc_e2e',
  code: 'malicious_instructions',
  message: 'The page asks the model to do something else.',
}

const computerCall = {
  type: 'computer_call',
  id: 'cu_e2e',
  call_id: 'call_cu_e2e',
  status: 'completed',
  action: { type: 'click', button: 'left', x: 10, y: 20 },
  pending_safety_checks: [safetyCheck],
}

// The computer tool of the newer models sends a batch of actions.
const batchCall = {
  type: 'computer_call',
  id: 'cu_e2e_batch',
  call_id: 'call_cu_e2e_batch',
  status: 'completed',
  actions: [
    { type: 'click', button: 'left', x: 10, y: 20 },
    { type: 'type', text: 'hello' },
  ],
  pending_safety_checks: [],
}

const screenshot = [
  {
    type: 'image' as const,
    source: { type: 'data' as const, value: SCREENSHOT, mimeType: 'image/png' },
  },
]

const answer = {
  type: 'message',
  id: 'msg_cu_e2e',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
}

function responseStream(
  id: string,
  output: Array<unknown>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'response.created',
      response: { id, object: 'response', status: 'in_progress', output: [] },
    },
    {
      type: 'response.completed',
      response: {
        id,
        object: 'response',
        status: 'completed',
        output,
        usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
      },
    },
  ]
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

/**
 * Drives the OpenAI Responses adapter through one computer use step. A
 * custom `fetch` answers the first request with a `computer_call` and the
 * second with text, and records each request body. aimock cannot send a
 * `computer_call`, so this route serves the stream itself.
 *
 * `?tool=computer` uses the `computer` tool of `gpt-6.1-sol`, with a batch
 * of actions. Anything else uses `computer_use_preview`.
 */
export const Route = createFileRoute('/api/openai-computer-use-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const batch =
          new URL(request.url).searchParams.get('tool') === 'computer'
        const requestBodies: Array<unknown> = []
        const mockFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          requestBodies.push(JSON.parse(await req.text()))
          const stream =
            requestBodies.length === 1
              ? responseStream('resp_cu_e2e_1', [
                  batch ? batchCall : computerCall,
                ])
              : responseStream('resp_cu_e2e_2', [answer])
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        const toolInputs: Array<unknown> = []
        const execute = async (input: unknown) => {
          toolInputs.push(input)
          return screenshot
        }
        const messages = [
          { role: 'user' as const, content: 'Click the button.' },
        ]
        try {
          const stream = batch
            ? chat({
                ...createChatOptions({
                  adapter: createOpenaiChat('gpt-6.1-sol', DUMMY_KEY, {
                    fetch: mockFetch,
                  }),
                }),
                messages,
                tools: [{ ...computerUseTool({ type: 'computer' }), execute }],
              })
            : chat({
                ...createChatOptions({
                  adapter: createOpenaiChat('computer-use-preview', DUMMY_KEY, {
                    fetch: mockFetch,
                  }),
                }),
                messages,
                tools: [
                  {
                    ...computerUseTool({
                      type: 'computer_use_preview',
                      display_width: 1024,
                      display_height: 768,
                      environment: 'browser',
                    }),
                    execute,
                  },
                ],
              })
          for await (const _ of stream) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, toolInputs, requestBodies })
      },
    },
  },
})
