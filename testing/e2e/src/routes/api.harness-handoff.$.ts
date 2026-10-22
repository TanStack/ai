import { createFileRoute } from '@tanstack/react-router'
import { defineAgent } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
  membersOnly,
} from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { createSessionView } from '@tanstack/ai-harness/view'
import { memoryPersistence } from '@tanstack/ai-persistence'
import type {
  HarnessHost,
  HarnessSession,
  HarnessUser,
} from '@tanstack/ai-harness'
import type { SessionView } from '@tanstack/ai-harness/view'

/**
 * Handoffs inside one session, over the harness protocol. The harness has
 * `routing` and one root agent, `billing`. The host has `membersOnly()`
 * access: olga owns the thread, and bea is an operator.
 *
 * - `POST .../start` with `{ scenario }` opens the thread for olga and
 *   shares it with bea. Returns the run id and the thread id.
 *   - `'agent'`: the main model calls the `handoff` tool to `billing`.
 *   - `'human'`: the harness has `routing.allowHandoffToHuman`, and the main model calls
 *     the `handoff` tool to a person.
 *   - `'code'`: the router picks the `triage` agent, and its code hands off
 *     to `billing` with `ctx.harness.handoff`. The main model never runs.
 * - `POST .../control?runId=` and `GET .../snapshot?runId=` go to the
 *   harness handler. The `authorization` header names the user.
 * - `GET .../settled?runId=&inputId=` waits until an input ends, and
 *   returns its outcome.
 * - `GET .../debug?runId=` returns what the test checks: the
 *   `harness.handoff` events of the session stream, the transcript, the
 *   messages of a session view, the open waits, the model calls, and the
 *   messages of the first request of `billing`.
 * - `POST .../stop?runId=` closes the host.
 *
 * A custom `fetch` answers with canned Anthropic streams, so no aimock
 * fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'
const NAME = 'e2e/harness-handoff'

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

/** An answer that calls the `handoff` tool with `input`. */
const callHandoff = (input: Record<string, unknown>) => (id: string) =>
  sseOf([
    messageStart(id),
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: `toolu_${id}`,
        name: 'handoff',
        input: {},
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) },
    },
    ...ending('tool_use'),
  ])

/** An answer with the text `text`. */
const reply = (text: string) => (id: string) =>
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

/**
 * A model that answers with `answers`, in order. `calls` counts its
 * requests, and `requests` keeps the body of each one.
 */
function scriptedModel(prefix: string, answers: Array<(id: string) => string>) {
  const counter = { calls: 0 }
  const requests: Array<{ messages?: Array<unknown> }> = []
  const scriptedFetch: typeof fetch = async (_url, init) => {
    counter.calls += 1
    if (typeof init?.body === 'string') requests.push(JSON.parse(init.body))
    const answer = answers[counter.calls - 1] ?? reply('No more answers.')
    return new Response(answer(`msg_${prefix}_${counter.calls}`), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const adapter = createAnthropicChat(MODEL, DUMMY_KEY, {
    fetch: scriptedFetch,
  })
  return { adapter, counter, requests }
}

type Scenario = 'agent' | 'human' | 'code'

/** The answers of the main model and of `billing`, per scenario. */
const SCRIPTS: Record<
  Scenario,
  {
    main: Array<(id: string) => string>
    billing: Array<(id: string) => string>
  }
> = {
  agent: {
    main: [callHandoff({ to: 'billing', note: 'Refund for order 42.' })],
    billing: [reply('Your refund is on its way.'), reply('Billing again.')],
  },
  human: {
    main: [
      callHandoff({ to: { human: true }, note: 'The user asks for a person.' }),
      reply('The main model is back.'),
    ],
    billing: [],
  },
  code: {
    main: [],
    billing: [reply('Your refund is on its way.')],
  },
}

/** An agent with no model: its code hands the turn to `billing`. */
const triage = defineAgent({
  name: 'triage',
  description: 'Sorts requests',
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('triage must run in a harness.')
    await ctx.harness.handoff({ to: 'billing', note: 'Refund for order 42.' })
    return 'Passing you to billing.'
  },
})

interface User extends HarnessUser {
  tenantId: string
}
const USERS: Record<string, User> = {
  olga: { id: 'olga', tenantId: 'acme' },
  bea: { id: 'bea', tenantId: 'acme' },
}

interface Run {
  threadId: string
  owner: HarnessSession
  view: SessionView
  handoffs: Array<unknown>
  main: ReturnType<typeof scriptedModel>
  billing: ReturnType<typeof scriptedModel>
  handler: (request: Request) => Promise<Response>
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
  const threadId = `e2e-harness-handoff-${scenario}-${runId}`
  const main = scriptedModel('main', SCRIPTS[scenario].main)
  const billing = scriptedModel('billing', SCRIPTS[scenario].billing)
  const harness = defineHarness({
    name: NAME,
    adapter: main.adapter,
    agents: [
      ...(scenario === 'code' ? [triage] : []),
      defineAgent({
        name: 'billing',
        description: 'Refunds and invoices',
        run: (ctx) =>
          ctx.chat({
            adapter: billing.adapter,
            systemPrompts: ['You are billing.'],
          }),
      }),
    ],
    // The router picks nothing, so the active agent answers. In `code`, it
    // picks `triage`.
    routing: {
      router: () => (scenario === 'code' ? 'triage' : undefined),
      allowHandoffToHuman: scenario === 'human',
    },
  })
  const host: HarnessHost<User> = createHarnessHost({
    persistence: memoryPersistence(),
    access: {
      getUser: ({ request: incoming }): User | null =>
        USERS[incoming.headers.get('authorization') ?? ''] ?? null,
      rules: membersOnly(),
    },
  })
  try {
    const owner = await host.open(harness, {
      threadId,
      user: USERS.olga,
    })
    await host.sessions.share({
      threadId,
      userId: 'bea',
      role: 'operator',
      user: USERS.olga,
    })
    const handoffs: Array<unknown> = []
    owner.onEvent('CUSTOM', ({ event }) => {
      if (event.name === HARNESS_EVENTS.handoff) handoffs.push(event.value)
    })
    const view = createSessionView(owner)
    await view.ready
    const stop = async () => {
      if (!runs.delete(runId)) return
      view.dispose()
      await owner.close()
      await host.close()
    }
    runs.set(runId, {
      threadId,
      owner,
      view,
      handoffs,
      main,
      billing,
      handler: createHarnessHandler({ host, harness }),
      stop,
    })
    setTimeout(() => void stop(), RUN_TTL_MS)
    return Response.json({ runId, threadId })
  } catch (error) {
    await host.close()
    return Response.json({ error: errorOf(error) })
  }
}

/** The text of a message, when its content is a string. */
const textOf = (content: unknown) =>
  typeof content === 'string' ? content : ''

async function debug(run: Run) {
  const transcript = await run.owner.transcript()
  const snapshot = run.owner.snapshot()
  return Response.json({
    status: snapshot.status,
    handoffs: run.handoffs,
    // `metadata.harness` names the agent or the operator who wrote it.
    transcript: transcript.map((message) => ({
      role: message.role,
      text: textOf(message.content),
      harness: message.metadata?.harness ?? null,
    })),
    view: run.view.store.get().messages.map((message) => ({
      role: message.role,
      agent: message.role === 'assistant' ? (message.agent ?? null) : null,
      text:
        message.role === 'assistant'
          ? message.parts
              .map((part) => (part.type === 'text' ? part.text : ''))
              .join('')
          : message.text,
    })),
    waits: snapshot.pendingWaits,
    mainCalls: run.main.counter.calls,
    billingCalls: run.billing.counter.calls,
    billingMessages: run.billing.requests[0]?.messages ?? [],
  })
}

export const Route = createFileRoute('/api/harness-handoff/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const route = url.pathname.split('/').at(-1)
        if (route === 'start') return start(request)
        const run = runs.get(url.searchParams.get('runId') ?? '')
        if (!run) return Response.json({ error: 'No such run.' })
        if (route === 'control') return run.handler(request)
        if (route === 'stop') {
          await run.stop()
          return Response.json({ stopped: true })
        }
        return Response.json({ error: `No route ${route}.` }, { status: 404 })
      },
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const route = url.pathname.split('/').at(-1)
        const run = runs.get(url.searchParams.get('runId') ?? '')
        if (!run) return Response.json({ error: 'No such run.' })
        try {
          if (route === 'snapshot') return await run.handler(request)
          if (route === 'settled') {
            const inputId = url.searchParams.get('inputId') ?? ''
            return Response.json(await run.owner.settled({ inputId }))
          }
          return await debug(run)
        } catch (error) {
          return Response.json({ error: errorOf(error) })
        }
      },
    },
  },
})
