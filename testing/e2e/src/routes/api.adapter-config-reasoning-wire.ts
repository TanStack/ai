import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import type { ModelReasoning } from '@tanstack/ai'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/** A gateway id that the Anthropic adapter does not list. */
const GATEWAY_MODEL = 'anthropic/claude-sonnet-4.6'

/**
 * Model ids and the reasoning data of their catalog records
 * (`modelReasoning(record)` of `@tanstack/ai-models`).
 */
const CASES: Array<{ model: string; reasoning: ModelReasoning }> = [
  // Vercel AI Gateway: Claude 4.6 thinks adaptively.
  {
    model: GATEWAY_MODEL,
    reasoning: {
      map: { off: 'none', minimal: null, xhigh: null, max: 'max' },
      budget: true,
      adaptive: true,
    },
  },
  // Vercel AI Gateway: a model of another vendor thinks with a budget.
  {
    model: 'openai/gpt-5',
    reasoning: {
      map: { off: null, xhigh: null, max: null },
      budget: false,
      adaptive: false,
    },
  },
  // OpenRouter: mid-conversation effort.
  {
    model: 'anthropic/claude-opus-5.5',
    reasoning: {
      map: { off: null, minimal: null, xhigh: 'xhigh', max: 'max' },
      budget: false,
      adaptive: true,
      midConversationEffort: true,
    },
  },
  // `reasoning: false`: no thinking field.
  { model: GATEWAY_MODEL, reasoning: false },
]

/**
 * Wire-format verification for the `reasoning` config of an adapter.
 *
 * The route runs `chat({ reasoning: 'high' })` once for each of `CASES`:
 * model ids that the Anthropic adapter does not list, with the reasoning
 * data of their records in the config. A custom `fetch` records each
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
        const capturedBetas: Array<string | null> = []

        /** Records the outgoing request and answers with the synthetic stream. */
        const capturingFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          const rawBody = await req.text()
          capturedRequests.push(
            rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null,
          )
          capturedBetas.push(req.headers.get('anthropic-beta'))
          return new Response(makeSyntheticAnthropicStream(), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          })
        }

        try {
          for (const { model, reasoning } of CASES) {
            for await (const _ of chat({
              adapter: createAnthropicChat(model, DUMMY_KEY, {
                fetch: capturingFetch,
                reasoning,
              }),
              messages: [
                { role: 'user', content: '[config-reasoning] plan it' },
              ],
              reasoning: 'high',
              promptCache: 'none',
            })) {
              // Drain the stream.
            }
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            capturedRequests,
            capturedBetas,
          })
        }

        return Response.json({ ok: true, capturedRequests, capturedBetas })
      },
    },
  },
})
