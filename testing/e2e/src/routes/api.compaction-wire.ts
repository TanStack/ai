import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, maxIterations } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import {
  clearToolResults,
  evictOldest,
  withCompaction,
} from '@tanstack/ai-compaction'
import type {
  CompactionInfo,
  CompactionStrategy,
} from '@tanstack/ai-compaction'
import type { ModelMessage } from '@tanstack/ai'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

function makeTextStream(callNumber: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const responseId = `resp_compaction_${callNumber}`
  const itemId = `msg_compaction_${callNumber}`
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

// native: what `/responses/compact` returns. aimock has no route for it, so
// the capturing fetch serves it.
const compactedResponse = {
  id: 'resp_compact_e2e',
  created_at: 1,
  object: 'response.compaction',
  output: [
    {
      type: 'message',
      id: 'msg_kept_e2e',
      role: 'user',
      status: 'completed',
      content: [{ type: 'input_text', text: 'KEEP_ME_LAST' }],
    },
    { type: 'compaction', id: 'cmp_e2e', encrypted_content: 'SEALED_E2E' },
  ],
  usage: { input_tokens: 50, output_tokens: 5, total_tokens: 55 },
}

/**
 * Wire-format verification for `withCompaction`. A capturing `fetch` records the
 * outgoing request body so the spec can assert what each strategy sent.
 *
 * `?strategy=clear` uses `clearToolResults` on a tool-heavy history.
 * `?strategy=native` turns on the adapter's own compaction.
 * `?strategy=native-empty` does too, but the compact result has no compaction
 * item, so `evictOldest` runs in its place. Anything else uses `evictOldest`
 * on a plain chat history.
 */
export const Route = createFileRoute('/api/compaction-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = new URL(request.url).searchParams.get('strategy')
        const clear = mode === 'clear'

        const requestBodies: Array<unknown> = []
        const compactRequestBodies: Array<unknown> = []

        const mockFetch: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          if (req.url.endsWith('/responses/compact')) {
            compactRequestBodies.push(JSON.parse(await req.text()))
            return Response.json(
              mode === 'native-empty'
                ? {
                    ...compactedResponse,
                    output: compactedResponse.output.filter(
                      (item) => item.type !== 'compaction',
                    ),
                  }
                : compactedResponse,
            )
          }
          requestBodies.push(JSON.parse(await req.text()))
          return new Response(makeTextStream(requestBodies.length), {
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
        const persistence = memoryPersistence()
        let compactionCount = 0
        const compactionErrors: Array<string> = []
        const onCompact = (info: CompactionInfo) => {
          compactionCount++
          if (info.error) compactionErrors.push(info.error.message)
        }
        const native = mode?.startsWith('native') ? adapter : undefined

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages,
            threadId: 'compaction-wire',
            runId: 'compaction-wire-1',
            middleware: [
              withPersistence(persistence),
              withCompaction({
                maxTokens: 60,
                strategy,
                native,
                onCompact,
              }),
            ],
            agentLoopStrategy: maxIterations(1),
          })) {
            // Drain the stream.
          }

          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [],
            threadId: 'compaction-wire',
            runId: 'compaction-wire-2',
            middleware: [
              withPersistence(persistence),
              withCompaction({
                maxTokens: 60,
                strategy,
                native,
                onCompact,
              }),
            ],
            agentLoopStrategy: maxIterations(1),
          })) {
            // Drain the restored run.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        const canonicalMessages =
          await persistence.stores.messages.loadThread('compaction-wire')
        return Response.json({
          ok: true,
          firstRequestBody: requestBodies[0],
          secondRequestBody: requestBodies[1],
          compactRequestBodies,
          canonicalMessages,
          compactionCount,
          compactionErrors,
        })
      },
    },
  },
})
