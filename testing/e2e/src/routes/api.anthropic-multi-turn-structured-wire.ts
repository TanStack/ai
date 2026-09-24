import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
} from '@tanstack/ai'
import { StreamProcessor, uiMessagesToWire } from '@tanstack/ai/client'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { recipeSchema } from '@/lib/schemas'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

const FIRST_RECIPE = JSON.stringify({
  title: 'Classic Spaghetti Pomodoro',
  cuisine: 'Italian',
  servings: 2,
  estimatedCostUsd: 12,
  ingredients: [{ item: 'spaghetti', amount: '200 g' }],
  steps: ['Cook the pasta'],
  tips: ['Salt the water'],
})

const SECOND_RECIPE = JSON.stringify({
  title: 'Vegan Spaghetti Pomodoro',
  cuisine: 'Italian',
  servings: 2,
  estimatedCostUsd: 11,
  ingredients: [{ item: 'spaghetti', amount: '200 g' }],
  steps: ['Cook the pasta'],
  tips: ['Nutritional yeast stands in for the parmesan'],
})

const PROMPTS = [
  '[multiturn-structured-wire-1] pasta dinner for two',
  '[multiturn-structured-wire-2] now make it vegan',
]

/** Claude 4.5+ combined-mode turn: the whole final text is the schema JSON. */
function makeStructuredAnthropicStream(
  json: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_multi_turn_structured_wire',
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
      delta: { type: 'text_delta', text: json },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 20 },
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

/**
 * Two structured turns on Anthropic's #605 native combined path, captured on
 * the wire. `StreamProcessor` consumes turn 1, then `uiMessagesToWire` +
 * `chatParamsFromRequestBody` rebuild the history exactly as a browser client
 * and `/api/chat` do before turn 2 goes back out.
 *
 * The capturing `fetch` answers with a synthetic Claude stream, so this needs
 * no fixture and never touches aimock's shared journal. The companion spec
 * reads `requestBodies[1]`.
 */
export const Route = createFileRoute(
  '/api/anthropic-multi-turn-structured-wire',
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
            makeStructuredAnthropicStream(
              requestBodies.length === 1 ? FIRST_RECIPE : SECOND_RECIPE,
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
              threadId: 'anthropic-multi-turn-structured-wire',
              runId: `anthropic-multi-turn-structured-wire-${index + 1}`,
              messages: JSON.parse(
                JSON.stringify(uiMessagesToWire(processor.getMessages())),
              ),
              tools: [],
              context: [],
            })

            const stream = chat({
              ...createChatOptions({ adapter }),
              messages: params.messages,
              outputSchema: recipeSchema,
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
