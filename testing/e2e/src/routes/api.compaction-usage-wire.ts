import { createFileRoute } from '@tanstack/react-router'
import {
  LogRecordsCapability,
  MetadataCapability,
  chat,
  createChatOptions,
  defineChatMiddleware,
  maxIterations,
  provideLogRecords,
  provideMetadata,
} from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import {
  evictOldest,
  projectCompaction,
  summarizeOldest,
  withCompaction,
} from '@tanstack/ai-compaction'
import type { CompactionInfo } from '@tanstack/ai-compaction'
import type { ChatMiddleware, MetadataStore, ModelMessage } from '@tanstack/ai'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'
const THREAD = 'compaction-usage-wire'
/** Where `withCompaction` keeps a ready background summary. */
const BACKGROUND_NAMESPACE = '@tanstack/ai-compaction:background'

/** One OpenAI Responses answer `ok` that reports `inputTokens` of usage. */
function textStream(callNumber: number, inputTokens: number) {
  const encoder = new TextEncoder()
  const id = `resp_usage_${callNumber}`
  const itemId = `msg_usage_${callNumber}`
  const events = [
    {
      type: 'response.created',
      response: { id, object: 'response', status: 'in_progress', output: [] },
    },
    {
      type: 'response.output_text.delta',
      response_id: id,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: 'ok',
    },
    {
      type: 'response.completed',
      response: {
        id,
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
        usage: {
          input_tokens: inputTokens,
          output_tokens: 2,
          total_tokens: inputTokens + 2,
        },
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

// About 15 + 10 + 3 = 28 estimated tokens.
const shortChat: Array<ModelMessage> = [
  { role: 'user', content: `SECRET_ALPHA_ONE ${'x'.repeat(40)}` },
  { role: 'assistant', content: 'x'.repeat(40) },
  { role: 'user', content: 'KEEP_ME_LAST' },
]
// The first run's messages, its answer, and one new question.
const nextTurn: Array<ModelMessage> = [
  ...shortChat,
  { role: 'assistant', content: 'ok' },
  { role: 'user', content: 'next' },
]

// About 41 + 10 + 10 = 61 estimated tokens: over atTokens 50, under maxTokens 100.
const backgroundChat: Array<ModelMessage> = [
  { role: 'user', content: `OLD_DETAIL ${'x'.repeat(150)}` },
  { role: 'assistant', content: 'x'.repeat(40) },
  { role: 'user', content: 'x'.repeat(40) },
]

type Case = 'usage' | 'compact-next' | 'durable' | 'background' | 'overflow'

function isCase(value: string | null): value is Case {
  return (
    value === 'usage' ||
    value === 'compact-next' ||
    value === 'durable' ||
    value === 'background' ||
    value === 'overflow'
  )
}

/** A metadata store in a Map, so the route can read what compaction wrote. */
function mapStore(): MetadataStore {
  const values = new Map<string, unknown>()
  return {
    get: async (namespace, key) => values.get(`${namespace}:${key}`) ?? null,
    set: async (namespace, key, value) => {
      values.set(`${namespace}:${key}`, value)
    },
    delete: async (namespace, key) => {
      values.delete(`${namespace}:${key}`)
    },
  }
}

/**
 * Wire checks for the newer `withCompaction` options. A capturing `fetch`
 * answers each OpenAI Responses call and records the request body.
 *
 * POST `?case=`:
 * - `usage`: `countTokens: 'usage'`. The first call reports 500 input tokens.
 *   The estimate of the second run is small, but the saved usage is over
 *   `maxTokens`, so the second request is compacted.
 * - `compact-next`: `auto: false` and a large `maxTokens`. `compactNext`
 *   compacts the first request anyway.
 * - `durable`: a host middleware provides `LogRecordsCapability`. The
 *   compaction goes into the log, and `projectCompaction` folds it to the
 *   list the model got.
 * - `background`: `background: { atTokens }`. The first run starts the
 *   summary and does not wait for it. The second run applies it.
 * - `overflow`: the first call fails with OpenAI's `context_length_exceeded`.
 *   `withCompaction` compacts and calls the model again in the same run.
 */
export const Route = createFileRoute('/api/compaction-usage-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const which = new URL(request.url).searchParams.get('case')
        if (!isCase(which)) {
          return Response.json({ ok: false, error: 'unknown case' })
        }

        const bodies: Array<unknown> = []
        const fetchMock: typeof fetch = async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          bodies.push(JSON.parse(await req.text()))
          if (which === 'overflow' && bodies.length === 1) {
            return Response.json(
              {
                error: {
                  message:
                    "This model's maximum context length is 128000 tokens.",
                  type: 'invalid_request_error',
                  code: 'context_length_exceeded',
                },
              },
              { status: 400 },
            )
          }
          return new Response(
            textStream(bodies.length, bodies.length === 1 ? 500 : 20),
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        }
        const adapter = createOpenaiChat('gpt-5.2', DUMMY_KEY, {
          fetch: fetchMock,
        })

        const compacted: Array<CompactionInfo> = []
        const onCompact = (info: CompactionInfo) => {
          compacted.push(info)
        }
        const records: Array<{ type: string } & Record<string, unknown>> = []
        const errors: Array<string | undefined> = []
        const store = mapStore()
        const host = defineChatMiddleware({
          name: 'e2e-host',
          provides: [LogRecordsCapability, MetadataCapability],
          setup(ctx) {
            provideLogRecords(ctx, {
              append: async (batch) => {
                records.push(...batch)
              },
            })
            provideMetadata(ctx, store)
          },
        })

        const run = async (
          messages: Array<ModelMessage>,
          runId: string,
          middleware: Array<ChatMiddleware>,
        ) => {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            messages,
            threadId: THREAD,
            runId,
            middleware,
            agentLoopStrategy: maxIterations(1),
          })) {
            if (chunk.type === 'RUN_ERROR') errors.push(chunk.code)
          }
        }

        try {
          if (which === 'usage') {
            const compaction = withCompaction({
              maxTokens: 100,
              countTokens: 'usage',
              strategy: evictOldest({ keepRecentTokens: 15 }),
              onCompact,
            })
            await run(shortChat, 'usage-1', [compaction])
            await run(nextTurn, 'usage-2', [compaction])
          }

          if (which === 'compact-next') {
            const compaction = withCompaction({
              maxTokens: 100_000,
              auto: false,
              strategy: evictOldest({ keepRecentTokens: 15 }),
              onCompact,
            })
            compaction.compactNext(THREAD)
            await run(shortChat, 'compact-next-1', [compaction])
          }

          if (which === 'overflow') {
            const compaction = withCompaction({
              maxTokens: 100_000,
              strategy: evictOldest({ keepRecentTokens: 15 }),
              onCompact,
            })
            await run(shortChat, 'overflow-1', [compaction])
          }

          if (which === 'durable') {
            const compaction = withCompaction({
              maxTokens: 20,
              durable: true,
              strategy: evictOldest({ keepRecentTokens: 15 }),
              onCompact,
            })
            await run(shortChat, 'durable-1', [host, compaction])
          }

          if (which === 'background') {
            const compaction = withCompaction({
              maxTokens: 100,
              background: { atTokens: 50 },
              strategy: summarizeOldest({
                summarize: async () => 'EARLIER_SUMMARY',
                keepRecentTokens: 25,
              }),
              onCompact,
            })
            await run(backgroundChat, 'background-1', [host, compaction])
            // The summary runs beside the first run. Wait until it is ready.
            for (let tries = 0; tries < 100; tries++) {
              if ((await store.get(BACKGROUND_NAMESPACE, THREAD)) !== null) {
                break
              }
              await new Promise((resolve) => setTimeout(resolve, 20))
            }
            await run(
              [
                ...backgroundChat,
                { role: 'assistant', content: 'ok' },
                { role: 'user', content: 'next' },
              ],
              'background-2',
              [host, compaction],
            )
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        const [record] = records
        return Response.json({
          ok: true,
          bodies,
          reasons: compacted.map((info) => info.reason),
          errors,
          records,
          folded: record
            ? projectCompaction({ messages: shortChat, record })
            : undefined,
        })
      },
    },
  },
})
