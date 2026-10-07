import { createFileRoute } from '@tanstack/react-router'
import { chat, isContextOverflow, toolDefinition } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import {
  COMPACTION_RECORD_TYPE,
  clearToolResults,
  projectCompaction,
  summarizeOldest,
  withCompaction,
} from '@tanstack/ai-compaction'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import type { AnyTextAdapter, MetadataStore, ModelMessage } from '@tanstack/ai'

/**
 * Durable compaction in a harness session, end to end, with the real
 * `withCompaction({ durable: true })`. A scripted `fetch` answers each
 * OpenAI Responses call, so no aimock fixture is needed. The usage of a call
 * is ceil(characters / 4) of the request body, like a faux model.
 *
 * POST `{ case }`:
 * - `silent-overflow`: Flue's settings. The second answer is over the context
 *   window with no error, so the after-turn check compacts: 3 calls.
 * - `error-overflow`: the second call fails with an overflow error.
 *   `turn.onModelError` calls `compactNext` and retries once: 4 calls.
 * - `turn-control`: the docs example. `auto: false` on a short chat, an
 *   overflow error, then `compactNext` and one retry: 4 calls.
 * - `parallel-tools`: the model calls 4 tools in one phase. Before the next
 *   call, `clearToolResults()` clears the oldest result and keeps 3: 2 calls.
 * - `empty-summary-overflow`: like `error-overflow`, but the summary is empty.
 *   The compaction fails, the history stays, and with `continueOnError` the
 *   retry overflows again, so the turn fails with the overflow error: 4 calls.
 * - `background`: `background: { atTokens }`. The second turn passes
 *   `atTokens`, so the summary runs beside it, on its own script. The third
 *   turn applies it at its first call: 3 calls and 1 summary call.
 *
 * Each case then opens a second host on the same log and returns its
 * transcript, so the spec can check that a rebuild gives the same context.
 */

const DUMMY_KEY = 'sk-e2e-test-dummy-key'
const THREAD = 'compaction-durable-wire'
const CONTEXT_WINDOW = 32_768
const MAX_OUTPUT = 4_096
const LONG_PROMPT = 'x'.repeat(70_000)
const OVERFLOW = 'Your input exceeds the context window of this model.'
/** About 4,000 tokens: under `atTokens` alone, over it with the second prompt. */
const BACKGROUND_FIRST = `OLD_DETAIL ${'x'.repeat(16_000)}`
const BACKGROUND_SUMMARY = 'Earlier: a long first prompt.'
/** Where `withCompaction` keeps a ready background summary. */
const BACKGROUND_NAMESPACE = '@tanstack/ai-compaction:background'

type Case =
  | 'silent-overflow'
  | 'error-overflow'
  | 'turn-control'
  | 'parallel-tools'
  | 'empty-summary-overflow'
  | 'background'
type Step = { text: string } | { error: string } | { tools: number }

const SCRIPTS: Record<Case, Array<Step>> = {
  'silent-overflow': [
    { text: 'First response.' },
    { text: 'Completed response.' },
    { text: 'Conversation summary.' },
  ],
  'error-overflow': [
    { text: 'First response.' },
    { error: OVERFLOW },
    { text: 'Conversation summary.' },
    { text: 'Recovered response.' },
  ],
  'turn-control': [
    { text: 'a1' },
    { error: OVERFLOW },
    { text: 'Earlier: the first question.' },
    { text: 'fits now' },
  ],
  'parallel-tools': [{ tools: 4 }, { text: 'All parts read.' }],
  'empty-summary-overflow': [
    { text: 'First response.' },
    { error: OVERFLOW },
    { text: '' },
    { error: OVERFLOW },
  ],
  background: [
    { text: 'First response.' },
    { text: 'Second response.' },
    { text: 'Third response.' },
  ],
}

const PROMPTS: Record<Case, Array<string>> = {
  'silent-overflow': [LONG_PROMPT, LONG_PROMPT],
  'error-overflow': [LONG_PROMPT, LONG_PROMPT],
  'turn-control': ['first question OLD_DETAIL', 'second question'],
  'parallel-tools': ['Read parts 1 to 4.'],
  'empty-summary-overflow': [LONG_PROMPT, LONG_PROMPT],
  background: [BACKGROUND_FIRST, 'y'.repeat(8_000), 'third question'],
}

/** Each result is about 500 tokens, so 4 of them are over `maxTokens`. */
const readPart = toolDefinition({
  name: 'read_part',
  description: 'Read one part of a long file.',
  inputSchema: z.object({ part: z.number() }),
}).server(({ part }) => `RESULT_${part} ${'r'.repeat(2_000)}`)

function caseOf(body: unknown): Case | undefined {
  if (typeof body !== 'object' || body === null || !('case' in body)) {
    return undefined
  }
  const value = body.case
  return value === 'silent-overflow' ||
    value === 'error-overflow' ||
    value === 'turn-control' ||
    value === 'parallel-tools' ||
    value === 'empty-summary-overflow' ||
    value === 'background'
    ? value
    : undefined
}

function sse(events: Array<Record<string, unknown>>) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/**
 * One Responses API stream: a text answer or parallel tool calls with usage,
 * or a failed response.
 */
function reply(step: Step, call: number, inputTokens: number) {
  const id = `resp_durable_${call}`
  const created = {
    type: 'response.created',
    response: { id, object: 'response', status: 'in_progress', output: [] },
  }
  if ('error' in step) {
    return sse([
      created,
      {
        type: 'response.failed',
        response: {
          id,
          object: 'response',
          status: 'failed',
          output: [],
          error: { code: 'context_length_exceeded', message: step.error },
        },
      },
    ])
  }
  const completed = (output: Array<Record<string, unknown>>, text: string) => {
    const outputTokens = Math.ceil(text.length / 4)
    return {
      type: 'response.completed',
      response: {
        id,
        object: 'response',
        status: 'completed',
        output,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      },
    }
  }
  if ('tools' in step) {
    const calls = Array.from({ length: step.tools }, (_, index) => ({
      id: `fc_durable_${call}_${index + 1}`,
      call_id: `call_part_${index + 1}`,
      type: 'function_call',
      name: 'read_part',
      arguments: JSON.stringify({ part: index + 1 }),
      status: 'completed',
    }))
    return sse([
      created,
      ...calls.flatMap((item, index) => [
        {
          type: 'response.output_item.added',
          response_id: id,
          output_index: index,
          item,
        },
        {
          type: 'response.function_call_arguments.done',
          response_id: id,
          item_id: item.id,
          output_index: index,
          arguments: item.arguments,
        },
      ]),
      completed(calls, JSON.stringify(calls)),
    ])
  }
  const itemId = `msg_durable_${call}`
  return sse([
    created,
    {
      type: 'response.output_text.delta',
      response_id: id,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: step.text,
    },
    completed(
      [
        {
          id: itemId,
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: step.text }],
        },
      ],
      step.text,
    ),
  ])
}

/** A `fetch` that answers each call with the next step, and keeps each body. */
function scriptedFetch(steps: Array<Step>) {
  const bodies: Array<unknown> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const body: unknown = await new Request(input, init).json()
    bodies.push(body)
    const step = steps[bodies.length - 1] ?? {
      error: 'No more scripted responses.',
    }
    return reply(
      step,
      bodies.length,
      Math.ceil(JSON.stringify(body).length / 4),
    )
  }
  return { fetch, bodies }
}

/** The summary is one more call of the same model, as in Flue. */
const summarizeWith =
  (adapter: AnyTextAdapter) => (messages: Array<ModelMessage>) =>
    chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation.\n\n${messages
            .map(
              (message) =>
                `${message.role}: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`,
            )
            .join('\n')}`,
        },
      ],
      stream: false,
    })

function compactionFor(testCase: Case, adapter: AnyTextAdapter) {
  if (testCase === 'parallel-tools') {
    return withCompaction({
      maxTokens: 1_000,
      durable: true,
      strategy: clearToolResults(),
    })
  }
  const summarize = summarizeWith(adapter)
  if (testCase === 'background') {
    // The second turn is about 6,000 tokens: over atTokens, under maxTokens.
    // The summary keeps the last 2,500 tokens, so it cuts after the first
    // prompt, and the applied list is under atTokens.
    return withCompaction({
      maxTokens: 10_000,
      background: { atTokens: 5_000 },
      durable: true,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 2_500 }),
    })
  }
  if (testCase === 'turn-control') {
    return withCompaction({
      maxTokens: 100_000,
      auto: false,
      durable: true,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 1 }),
    })
  }
  // Flue's `compaction: false`: no threshold compaction. The overflow check
  // after the turn and compactNext still run.
  return withCompaction({
    maxTokens: CONTEXT_WINDOW - MAX_OUTPUT,
    contextWindow: CONTEXT_WINDOW,
    countTokens: 'usage',
    auto: false,
    durable: true,
    strategy: summarizeOldest({ summarize, keepRecentTokens: 20_000 }),
    // A failed compaction sends the list as it is, so the retry fails with
    // the overflow error and not with an emptied context.
    ...(testCase === 'empty-summary-overflow' ? { continueOnError: true } : {}),
  })
}

/** The reasons of the compaction records in the log of the thread. */
async function recordReasons(log: ReturnType<typeof memoryLogStore>) {
  const entries = await log.read(THREAD, { after: 0 })
  return entries
    .filter((entry) => entry.record.type === COMPACTION_RECORD_TYPE)
    .map((entry) => entry.record.reason)
}

/** Wait until the background summary of the thread is ready. */
async function readyIn(metadata: MetadataStore) {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await metadata.get(BACKGROUND_NAMESPACE, THREAD)) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('The background summary was not ready.')
}

export const Route = createFileRoute('/api/compaction-durable-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const testCase = caseOf(await request.json())
        if (!testCase) {
          return Response.json({ ok: false, error: 'Unknown case.' })
        }
        const { fetch, bodies } = scriptedFetch(SCRIPTS[testCase])
        const adapter = createOpenaiChat('gpt-5.2', DUMMY_KEY, { fetch })
        // The background summary runs beside a turn, so it gets its own
        // script. One shared script would make the order of the calls a race.
        const summary = scriptedFetch([{ text: BACKGROUND_SUMMARY }])
        const compaction = compactionFor(
          testCase,
          testCase === 'background'
            ? createOpenaiChat('gpt-5.2', DUMMY_KEY, { fetch: summary.fetch })
            : adapter,
        )
        const harness = defineHarness({
          name: 'e2e/compaction-durable-wire',
          adapter,
          tools: testCase === 'parallel-tools' ? [readPart] : [],
          middleware: [compaction],
          turn: {
            // Flue's rule: after an overflow error, compact and retry once.
            onModelError: ({ error, retries, session }) => {
              if (retries > 0 || !isContextOverflow({ error: error.message })) {
                return undefined
              }
              compaction.compactNext(session.threadId)
              return 'retry'
            },
          },
        })
        const { runs, metadata } = memoryPersistence().stores
        const persistence = {
          stores: { log: memoryLogStore(), runs, metadata },
        }
        const project = { version: 'v1', record: projectCompaction }

        const texts: Array<string> = []
        let transcript: Array<ModelMessage>
        const first = createHarnessHost({ persistence, project })
        try {
          const session = await first.open(harness, { threadId: THREAD })
          for (const [index, prompt] of PROMPTS[testCase].entries()) {
            texts.push((await session.prompt(prompt)).text)
            // The second turn starts the summary beside it. Wait until it is
            // ready, so the third turn applies it at its first call.
            if (testCase === 'background' && index === 1) {
              await readyIn(persistence.stores.metadata)
            }
          }
          transcript = await session.transcript()
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            calls: bodies.length,
            records: await recordReasons(persistence.stores.log),
            lastRequest: bodies.at(-1),
          })
        } finally {
          await first.close()
        }

        // A second host folds the same log again.
        const second = createHarnessHost({ persistence, project })
        let rebuilt: Array<ModelMessage>
        try {
          const reopened = await second.open(harness, { threadId: THREAD })
          rebuilt = await reopened.transcript()
        } finally {
          await second.close()
        }

        return Response.json({
          ok: true,
          calls: bodies.length,
          summaryCalls: summary.bodies.length,
          texts,
          transcript,
          rebuilt,
          records: await recordReasons(persistence.stores.log),
          lastRequest: bodies.at(-1),
        })
      },
    },
  },
})
