import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'

/**
 * Wire check for `session.prompt(message, { overrides })`.
 *
 * One session runs three turns. Turn 1 and turn 3 have no overrides. Turn 2
 * sets another adapter, `reasoning`, and an extra tool. A custom `fetch`
 * records each request body and answers with a canned stream, so no aimock
 * fixture is needed. The route returns the model, the thinking field, and
 * the tool names of each request.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

const ANTHROPIC_REPLY = [
  {
    type: 'message_start',
    message: {
      id: 'msg_harness_turn_overrides',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-sonnet-4-6',
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

/** The fields of an Anthropic Messages request body that the spec reads. */
interface WireBody {
  model: string
  thinking?: unknown
  tools?: Array<{ name: string }>
}

const getGuitars = toolDefinition({
  name: 'get_guitars',
  description: 'List the guitars in stock',
}).server(async () => 'none')

const getPrice = toolDefinition({
  name: 'get_price',
  description: 'Get the price of a guitar',
}).server(async () => 'unknown')

export const Route = createFileRoute('/api/harness-turn-overrides')({
  server: {
    handlers: {
      POST: async () => {
        const bodies: Array<WireBody> = []
        const capturingFetch: typeof fetch = async (input, init) => {
          bodies.push(await new Request(input, init).json())
          const sse = ANTHROPIC_REPLY.map(
            (event) =>
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          ).join('')
          return new Response(sse, {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        const host = createHarnessHost()
        try {
          const session = await host.open(
            defineHarness({
              name: 'e2e/harness-turn-overrides',
              adapter: createAnthropicChat('claude-sonnet-4-6', DUMMY_KEY, {
                fetch: capturingFetch,
              }),
              tools: [getGuitars],
            }),
            { threadId: 'e2e-turn-overrides' },
          )
          await session.prompt('[harness-turn-overrides] one')
          await session.prompt('[harness-turn-overrides] two', {
            overrides: {
              adapter: createAnthropicChat('claude-opus-4-7', DUMMY_KEY, {
                fetch: capturingFetch,
              }),
              reasoning: { level: 'high' },
              tools: [getPrice],
            },
          })
          await session.prompt('[harness-turn-overrides] three')
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          await host.close()
        }

        return Response.json({
          requests: bodies.map((body) => ({
            model: body.model,
            thinking: body.thinking !== undefined,
            tools: (body.tools ?? []).map((tool) => tool.name),
          })),
        })
      },
    },
  },
})
