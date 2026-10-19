import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  durableTool,
  logIdOf,
} from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryLogBackend, memoryLogStore } from '@tanstack/ai-persistence'
import { z } from 'zod'
import type { HarnessHost } from '@tanstack/ai-harness'
import type { LogStore } from '@tanstack/ai-persistence'

/**
 * Durable waits across two servers. Two hosts on one log backend are two
 * servers on one database, with the same harness code. Host A gets the
 * prompt. Host B gets the answers.
 *
 * - `POST .../start` with `{ scenario }` starts the turn on host A.
 *   Returns the run id and the thread id.
 *   - `approval`: the model calls `deploy`, and `permissions()` asks for an
 *     approval before the tool runs. The turn stops with an approval wait.
 *   - `expiry`: the model calls `confirm`, a durable tool that asks with
 *     `step.ask` and an `expiresAt` 2 s later. Nobody answers.
 * - `POST .../control?runId=` goes to the handler of host B.
 * - `GET .../debug?runId=` returns what the test checks: how the first turn
 *   on host A ended, the snapshot and the transcript that host B reads from
 *   the log, the wait records of the log, and the model calls of each host.
 * - `POST .../stop?runId=` closes the hosts.
 *
 * A custom `fetch` answers with canned Anthropic streams, so no aimock
 * fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'
const NAME = 'e2e/harness-waits'
/** How long the question of the `expiry` scenario waits. */
const EXPIRY_MS = 2_000

type Scenario = 'approval' | 'expiry'
type AnthropicEvent = { type: string } & Record<string, unknown>

const sseOf = (events: Array<AnthropicEvent>) =>
  events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

const messageStart = (id: string): AnthropicEvent => ({
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
})

const ending = (stopReason: string): Array<AnthropicEvent> => [
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]

/** An answer that calls the tool `name` with no arguments. */
const callTool = (id: string, name: string) =>
  sseOf([
    messageStart(id),
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: `toolu_${name}`, name, input: {} },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    },
    ...ending('tool_use'),
  ])

/** An answer with the text `text`. */
const reply = (id: string, text: string) =>
  sseOf([
    messageStart(id),
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
    ...ending('end_turn'),
  ])

const deploy = toolDefinition({
  name: 'deploy',
  description: 'Deploy the app. Needs the approval of the user.',
  inputSchema: z.object({}),
}).server(() => Promise.resolve({ deployed: 'v2' }))

const confirm = toolDefinition({
  name: 'confirm',
  description: 'Ask the user to confirm the plan.',
  inputSchema: z.object({}),
})

/** The tool that the model calls, and its last answer, for each scenario. */
const SCRIPTS: Record<Scenario, { tool: string; done: string }> = {
  approval: { tool: 'deploy', done: 'Deployed v2.' },
  expiry: { tool: 'confirm', done: 'Nobody confirmed, so I stopped.' },
}

/**
 * The harness of `scenario`. Its model calls the tool first. When the
 * request has a tool result, it answers with the last text. So the turn
 * goes on the same way on any host. `calls` counts the requests that reach
 * the model of this host.
 */
function harnessWith(scenario: Scenario) {
  const script = SCRIPTS[scenario]
  const counter = { calls: 0 }
  const scriptedFetch: typeof fetch = async (_url, init) => {
    counter.calls += 1
    const body = typeof init?.body === 'string' ? init.body : ''
    const id = `msg_waits_${counter.calls}`
    const answer = body.includes('"tool_result"')
      ? reply(id, script.done)
      : callTool(id, script.tool)
    return new Response(answer, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const harness = defineHarness({
    name: NAME,
    adapter: createAnthropicChat(MODEL, DUMMY_KEY, { fetch: scriptedFetch }),
    tools: [deploy],
    plugins: () => [
      permissions({ rules: [{ tool: 'deploy', decision: 'ask' }] }),
      definePlugin({
        name: 'e2e/confirm',
        setup: () => ({
          tools: [
            durableTool(confirm, async (_args, { step }) => {
              const ok = await step.ask({
                name: 'confirm',
                message: 'Go on with the plan?',
                schema: z.boolean(),
                expiresAt: Date.now() + EXPIRY_MS,
              })
              return { confirmed: ok }
            }),
          ],
        }),
      }),
    ],
  })
  return { harness, counter }
}

/** The records of the log of `threadId` that open or end a wait. */
async function waitRecords(log: LogStore, threadId: string) {
  const logId = logIdOf({ logId: threadId })
  const records: Array<Record<string, unknown>> = []
  let after = 0
  for (;;) {
    const page = await log.read({ logId, after, limit: 256 })
    if (page.length === 0) return records
    for (const entry of page) {
      after = entry.seq
      const { type } = entry.record
      if (
        type === 'harness.interrupt' ||
        type === 'harness.interrupt.end' ||
        type === 'harness.wait' ||
        type === 'harness.wait.settled'
      ) {
        records.push(entry.record)
      }
    }
  }
}

/** The text of each message of the transcript. */
const textsOf = (messages: Array<{ role: string; content: unknown }>) =>
  messages.map((message) => ({
    role: message.role,
    text:
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content),
  }))

interface Run {
  threadId: string
  hostB: HarnessHost
  log: LogStore
  a: ReturnType<typeof harnessWith>
  b: ReturnType<typeof harnessWith>
  handlerB: (request: Request) => Promise<Response>
  /** How the first turn of host A ended. */
  turn: { text?: string; interrupts?: number; error?: string }
  stop: () => Promise<void>
}

// ponytail: the runs that did not stop yet, kept in memory by run id.
const runs = new Map<string, Run>()
/** A run that nobody stops ends after this time. */
const RUN_TTL_MS = 60_000

const errorOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

async function start(request: Request) {
  const { scenario }: { scenario: Scenario } = await request.json()
  const runId = crypto.randomUUID()
  const threadId = `e2e-harness-waits-${scenario}-${runId}`
  const backend = memoryLogBackend()
  const log = memoryLogStore({ backend })
  const hostA = createHarnessHost({ persistence: { stores: { log } } })
  const hostB = createHarnessHost({
    persistence: { stores: { log: memoryLogStore({ backend }) } },
  })
  const a = harnessWith(scenario)
  const b = harnessWith(scenario)
  try {
    const owner = await hostA.open(a.harness, { threadId })
    const handlerB = createHarnessHandler({
      host: hostB,
      harness: b.harness,
      openAccess: true,
    })
    const turn: Run['turn'] = {}
    owner.send(`[harness-waits] ${scenario}`).then(
      (result) => {
        turn.text = result.text
        turn.interrupts = result.interrupts?.length ?? 0
      },
      (error: unknown) => {
        turn.error = errorOf(error)
      },
    )
    const stop = async () => {
      if (!runs.delete(runId)) return
      await owner.close()
      await hostA.close()
      await hostB.close()
    }
    runs.set(runId, { threadId, hostB, log, a, b, handlerB, turn, stop })
    setTimeout(() => void stop(), RUN_TTL_MS)
    return Response.json({ runId, threadId })
  } catch (error) {
    await hostA.close()
    await hostB.close()
    return Response.json({ error: errorOf(error) })
  }
}

async function debug(run: Run) {
  // Host B reads the thread from the log, as any server can.
  const view = await run.hostB.observe(run.b.harness, {
    threadId: run.threadId,
  })
  const snapshot = await view.snapshot()
  return Response.json({
    turn: run.turn,
    status: snapshot.status,
    pendingWaits: snapshot.pendingWaits,
    transcript: textsOf(await view.transcript()),
    records: await waitRecords(run.log, run.threadId),
    modelCallsA: run.a.counter.calls,
    modelCallsB: run.b.counter.calls,
  })
}

export const Route = createFileRoute('/api/harness-waits/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const route = url.pathname.split('/').at(-1)
        if (route === 'start') return start(request)
        const run = runs.get(url.searchParams.get('runId') ?? '')
        if (!run) return Response.json({ error: 'No such run.' })
        if (route === 'control') return run.handlerB(request)
        if (route === 'stop') {
          await run.stop()
          return Response.json({ stopped: true })
        }
        return Response.json({ error: `No route ${route}.` }, { status: 404 })
      },
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const run = runs.get(url.searchParams.get('runId') ?? '')
        if (!run) return Response.json({ error: 'No such run.' })
        try {
          return await debug(run)
        } catch (error) {
          return Response.json({ error: errorOf(error) })
        }
      },
    },
  },
})
