import { createFileRoute } from '@tanstack/react-router'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createHarnessHost,
  createHarnessWorker,
  defineHarness,
} from '@tanstack/ai-harness'
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'
import type { HarnessHost } from '@tanstack/ai-harness'

/**
 * A background agent that one server stores and a worker on another server
 * runs. Two hosts on one log backend are two servers on one database. Host A
 * runs nothing. The worker runs on host B. Host A reads the thread.
 *
 * `POST` starts a run and returns its id. The `submit` scenario stores an
 * input with `host.submit` on host A. The `schedule` scenario opens the
 * thread on a third host, schedules an input for a short time later, and
 * closes that host. Then a worker starts on host B.
 *
 * `GET ?runId=` reads the thread from host A. When the answer is there, it
 * stops the worker and closes the hosts.
 *
 * A custom `fetch` answers with canned Anthropic streams, so no aimock
 * fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'
const NAME = 'e2e/harness-worker'

const reply = (id: string, text: string) =>
  [
    {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        content: [],
        model: MODEL,
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
      delta: { type: 'text_delta', text },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

/** A harness whose model always answers `text`. `calls` counts its requests. */
function harnessWith(text: string) {
  const counter = { calls: 0 }
  const scriptedFetch: typeof fetch = async () => {
    counter.calls += 1
    return new Response(reply(`msg_worker_${counter.calls}`, text), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const harness = defineHarness({
    name: NAME,
    adapter: createAnthropicChat(MODEL, DUMMY_KEY, { fetch: scriptedFetch }),
  })
  return { harness, counter }
}

/** The text of each message of the transcript. */
const textsOf = (messages: Array<{ role: string; content: unknown }>) =>
  messages.map((message) => ({
    role: message.role,
    text: typeof message.content === 'string' ? message.content : '',
  }))

interface Run {
  threadId: string
  hostA: HarnessHost
  a: ReturnType<typeof harnessWith>
  b: ReturnType<typeof harnessWith>
  stop: () => Promise<void>
}

// ponytail: the runs that did not end yet, kept in memory by run id.
const runs = new Map<string, Run>()
/** A run that nobody reads ends after this time. */
const RUN_TTL_MS = 60_000

export const Route = createFileRoute('/api/harness-worker')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { scenario } = (await request.json()) as {
          scenario: 'submit' | 'schedule'
        }
        const runId = crypto.randomUUID()
        const threadId = `e2e-harness-worker-${scenario}-${runId}`
        const logState = memoryLogState()
        const hostOn = () =>
          createHarnessHost({
            persistence: {
              stores: { log: memoryLogStore({ state: logState }) },
            },
          })
        // Host A must not run the thread, so its model has another answer.
        const a = harnessWith('Not on host A.')
        const b = harnessWith('Done by the worker.')
        const hostA = hostOn()
        const hostB = hostOn()
        try {
          let receipt: { status: string } | undefined
          if (scenario === 'submit') {
            receipt = await hostA.submit({
              harness: a.harness,
              threadId,
              input: { op: 'prompt', message: '[harness-worker] submitted' },
            })
          } else {
            // The planner opens the thread, schedules the input, and stops.
            const planner = hostOn()
            const p = harnessWith('Not on the planner.')
            const session = await planner.open(p.harness, { threadId })
            await session.schedule({
              at: Date.now() + 300,
              input: { op: 'prompt', message: '[harness-worker] scheduled' },
            })
            await session.close()
            await planner.close()
          }
          const worker = createHarnessWorker({
            host: hostB,
            harnesses: [b.harness],
            pollMs: 50,
          })
          const stop = async () => {
            if (!runs.delete(runId)) return
            await worker.stop()
            await hostB.close()
            await hostA.close()
          }
          runs.set(runId, { threadId, hostA, a, b, stop })
          setTimeout(() => void stop(), RUN_TTL_MS)
          return Response.json({ runId, receipt })
        } catch (error) {
          await hostA.close()
          await hostB.close()
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
      GET: async ({ request }) => {
        const runId = new URL(request.url).searchParams.get('runId') ?? ''
        const run = runs.get(runId)
        if (!run) return Response.json({ error: `No run ${runId}.` })
        try {
          const view = await run.hostA.observe(run.a.harness, {
            threadId: run.threadId,
          })
          const transcript = textsOf(await view.transcript())
          const answered = transcript.some(
            (message) => message.role === 'assistant',
          )
          const result = {
            answered,
            transcript,
            hostACalls: run.a.counter.calls,
            workerCalls: run.b.counter.calls,
          }
          if (answered) await run.stop()
          return Response.json(result)
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
