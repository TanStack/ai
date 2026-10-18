import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  durableTool,
  logIdOf,
} from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryLogBackend, memoryLogStore } from '@tanstack/ai-persistence'
import { z } from 'zod'
import type { CredentialStore } from '@tanstack/ai/byok'
import type { HarnessHost, HarnessSession } from '@tanstack/ai-harness'
import type { LogStore } from '@tanstack/ai-persistence'

/**
 * A secret answer that a user sends to a server that does not run the
 * thread. Two hosts on one log backend are two servers on one database.
 * Host A runs the turn. Its `signIn` tool asks a secret question, and its
 * result has the answer in it on purpose, so the test sees that the harness
 * scrubs tool results too. The user sends the answer to the handler of
 * host B.
 *
 * - `POST .../start` with `{ credentials }` opens the thread on both hosts
 *   and starts the turn on host A. With `credentials: true`, both hosts
 *   share one credential store. Returns the run id.
 * - `POST .../control?runId=` goes to the handler of host B.
 * - `GET .../debug?runId=` returns what the test checks: the transcript,
 *   the session events of both hosts, the raw records of the log store, the
 *   bodies that the model got, and the entries of the credential store.
 * - `POST .../stop?runId=` closes the hosts.
 *
 * A custom `fetch` answers with canned Anthropic streams, so no aimock
 * fixture is needed.
 */

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'
const MODEL = 'claude-sonnet-5-5'
const NAME = 'e2e/harness-secret-answer'

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

/** An answer that calls the `signIn` tool. */
const callSignIn = (id: string) =>
  sseOf([
    messageStart(id),
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'toolu_sign_in',
        name: 'signIn',
        input: {},
      },
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

const signIn = toolDefinition({
  name: 'signIn',
  description: 'Sign the user in. Asks for their password.',
  inputSchema: z.object({}),
})

/**
 * A harness whose model answers with `answers`, in order. `bodies` keeps
 * the body of each request that reaches the model.
 */
function harnessWith(answers: Array<(id: string) => string>) {
  const bodies: Array<string> = []
  const scriptedFetch: typeof fetch = async (_url, init) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '')
    const answer =
      answers[bodies.length - 1] ?? ((id) => reply(id, 'No more answers.'))
    return new Response(answer(`msg_secret_${bodies.length}`), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const harness = defineHarness({
    name: NAME,
    adapter: createAnthropicChat(MODEL, DUMMY_KEY, { fetch: scriptedFetch }),
    plugins: () => [
      definePlugin({
        name: 'e2e/sign-in',
        setup: () => ({
          tools: [
            durableTool(signIn, async (_args, { step }) => {
              const password = await step.ask({
                name: 'password',
                message: 'Password?',
                schema: z.string(),
                secret: true,
              })
              // On purpose: the result has the secret, as a careless tool
              // can. The harness must scrub it everywhere.
              return { signedIn: true, echo: `password was ${password}` }
            }),
          ],
        }),
      }),
    ],
  })
  return { harness, bodies }
}

/** Every record of the log of `threadId`, as the store keeps it. */
async function rawRecords(log: LogStore, threadId: string) {
  const logId = logIdOf({ logId: threadId })
  const records: Array<unknown> = []
  let after = 0
  for (;;) {
    const page = await log.read({ logId, after, limit: 256 })
    if (page.length === 0) return records
    for (const entry of page) {
      after = entry.seq
      records.push(entry)
    }
  }
}

interface Run {
  threadId: string
  owner: HarnessSession
  logA: LogStore
  credentials: CredentialStore | undefined
  /** The ids that the credential store saved. */
  saved: Array<string>
  events: Array<unknown>
  a: ReturnType<typeof harnessWith>
  b: ReturnType<typeof harnessWith>
  handlerB: (request: Request) => Promise<Response>
  turn: { text?: string; error?: string }
  stop: () => Promise<void>
}

// ponytail: the runs that did not stop yet, kept in memory by run id.
const runs = new Map<string, Run>()
/** A run that nobody stops ends after this time. */
const RUN_TTL_MS = 60_000

const errorOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

async function start(request: Request) {
  const body: { credentials?: boolean } = await request.json()
  const runId = crypto.randomUUID()
  const threadId = `e2e-harness-secret-answer-${runId}`
  const backend = memoryLogBackend()
  const logA = memoryLogStore({ backend })
  const saved: Array<string> = []
  let credentials: CredentialStore | undefined
  if (body.credentials) {
    const store = memoryCredentialStore()
    credentials = {
      ...store,
      set: async (entry) => {
        saved.push(entry.id)
        await store.set(entry)
      },
    }
  }
  const hostOn = (log: LogStore): HarnessHost =>
    createHarnessHost({
      persistence: { stores: { log } },
      ...(credentials ? { credentials } : {}),
    })
  const hostA = hostOn(logA)
  const hostB = hostOn(memoryLogStore({ backend }))
  const a = harnessWith([callSignIn, (id) => reply(id, 'Signed in.')])
  // Host B must not run the turn, so its model has another answer.
  const b = harnessWith([(id) => reply(id, 'Not on host B.')])
  try {
    const owner = await hostA.open(a.harness, { threadId })
    const other = await hostB.open(b.harness, { threadId })
    const events: Array<unknown> = []
    owner.onEvent((entry) => events.push({ host: 'A', ...entry }))
    other.onEvent((entry) => events.push({ host: 'B', ...entry }))
    const handlerB = createHarnessHandler({
      host: hostB,
      harness: b.harness,
      openAccess: true,
    })
    const turn: Run['turn'] = {}
    owner.send('[harness-secret-answer] sign me in').then(
      (result) => {
        turn.text = result.text
      },
      (error: unknown) => {
        turn.error = errorOf(error)
      },
    )
    const stop = async () => {
      if (!runs.delete(runId)) return
      await owner.close()
      await other.close()
      await hostA.close()
      await hostB.close()
    }
    runs.set(runId, {
      threadId,
      owner,
      logA,
      credentials,
      saved,
      events,
      a,
      b,
      handlerB,
      turn,
      stop,
    })
    setTimeout(() => void stop(), RUN_TTL_MS)
    return Response.json({ runId, threadId })
  } catch (error) {
    await hostA.close()
    await hostB.close()
    return Response.json({ error: errorOf(error) })
  }
}

async function debug(run: Run) {
  return Response.json({
    questionId: run.owner.snapshot().pendingQuestions[0]?.questionId ?? null,
    turn: run.turn,
    transcript: await run.owner.transcript(),
    events: run.events,
    records: await rawRecords(run.logA, run.threadId),
    modelBodies: run.a.bodies,
    otherModelCalls: run.b.bodies.length,
    saved: run.saved,
    // The entries of the default scope, where an answer without a user goes.
    stored: run.credentials ? await run.credentials.list({}) : null,
  })
}

export const Route = createFileRoute('/api/harness-secret-answer/$')({
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
