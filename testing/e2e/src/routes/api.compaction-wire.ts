import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, maxIterations } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import {
  clearToolResults,
  evictOldest,
  withCompaction,
} from '@tanstack/ai-compaction'
import type { CompactionStrategy } from '@tanstack/ai-compaction'
import type { ModelMessage } from '@tanstack/ai'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

function makeTextStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const responseId = 'resp_compaction'
  const itemId = 'msg_compaction'
  const events = [
    {
      type: 'response.created',
      response: {
        id: responseId,
        object: 'response',
        status: 'in_progress',
        output: [],
      },
    },
    {
      type: 'response.output_text.delta',
      response_id: responseId,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: 'ok',
    },
    {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        status: 'completed',
        output: [
          {
            id: itemId,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'ok' }],
          },
        ],
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

const FILLER = 'x'.repeat(160)

// evict: oldest message carries SECRET_ALPHA_ONE, newest carries KEEP_ME_LAST.
const evictMessages: Array<ModelMessage> = [
  { role: 'user', content: `SECRET_ALPHA_ONE ${FILLER}` },
  { role: 'assistant', content: FILLER },
  { role: 'user', content: FILLER },
  { role: 'assistant', content: FILLER },
  { role: 'user', content: `KEEP_ME_LAST ${FILLER}` },
]

// clear: two tool results. Oldest carries SECRET_TOOL_ALPHA (should be stubbed),
// newest carries KEEP_TOOL_BETA (kept). All messages stay in place.
const clearMessages: Array<ModelMessage> = [
  { role: 'user', content: 'run the tools' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [
      { id: 'a', type: 'function', function: { name: 'f', arguments: '{}' } },
    ],
  },
  { role: 'tool', content: `SECRET_TOOL_ALPHA ${FILLER}`, toolCallId: 'a' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [
      { id: 'b', type: 'function', function: { name: 'f', arguments: '{}' } },
    ],
  },
  { role: 'tool', content: `KEEP_TOOL_BETA ${FILLER}`, toolCallId: 'b' },
  { role: 'user', content: 'done?' },
]

/**
 * Wire-format verification for `withCompaction`. A capturing `fetch` records the
 * outgoing request body so the spec can assert what each strategy sent.
 *
 * `?strategy=clear` uses `clearToolResults` on a tool-heavy history; anything
 * else uses `evictOldest` on a plain chat history.
 */
export const Route = createFileRoute('/api/compaction-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clear =
          new URL(request.url).searchParams.get('strategy') === 'clear'

        let firstRequestBody: unknown

        const mockFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          if (firstRequestBody === undefined) {
            firstRequestBody = JSON.parse(await req.text())
          }
          return new Response(makeTextStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        const messages = clear ? clearMessages : evictMessages
        const strategy: CompactionStrategy = clear
          ? clearToolResults({ keepRecentToolResults: 1 })
          : evictOldest({ keepRecentTokens: 45 })

        const adapter = createOpenaiChat('gpt-5.2', DUMMY_KEY, {
          fetch: mockFetch,
        })

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages,
            middleware: [withCompaction({ maxTokens: 60, strategy })],
            agentLoopStrategy: maxIterations(1),
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, firstRequestBody })
      },
    },
  },
})
