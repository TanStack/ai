import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  durableTool,
  logIdOf,
} from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { createTextAdapter } from '@/lib/providers'
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
 *   the session events of both hosts, the raw records of the log store, and
 *   the entries of the credential store.
 * - `POST .../stop?runId=` closes the hosts.
 *
 * The models are the OpenAI adapter against aimock
 * (`fixtures/harness/secret-answer.json`). Host A sends the `x-test-id` of
 * the test, and host B the same id with `:b`, so the test reads the model
 * calls of each host from the aimock journal.
 */

const NAME = 'e2e/harness-secret-answer'

const signIn = toolDefinition({
  name: 'signIn',
  description: 'Sign the user in. Asks for their password.',
  inputSchema: z.object({}),
})

/** A harness whose model calls aimock with the test id `testId`. */
function harnessWith(testId: string) {
  return defineHarness({
    name: NAME,
    adapter: createTextAdapter('openai', undefined, undefined, testId).adapter,
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
  const testId = request.headers.get('x-test-id') ?? 'default'
  const runId = crypto.randomUUID()
  const threadId = `e2e-harness-secret-answer-${runId}`
  const logState = memoryLogState()
  const logA = memoryLogStore({ state: logState })
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
  const hostB = hostOn(memoryLogStore({ state: logState }))
  // Host B must not run the turn: the test checks that its id has no calls.
  const harnessB = harnessWith(`${testId}:b`)
  try {
    const owner = await hostA.open(harnessWith(testId), { threadId })
    const other = await hostB.open(harnessB, { threadId })
    const events: Array<unknown> = []
    owner.onEvent((entry) => events.push({ host: 'A', ...entry }))
    other.onEvent((entry) => events.push({ host: 'B', ...entry }))
    const handlerB = createHarnessHandler({
      host: hostB,
      harness: harnessB,
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
    questionId: run.owner.snapshot().pendingWaits[0]?.waitId ?? null,
    turn: run.turn,
    transcript: await run.owner.transcript(),
    events: run.events,
    records: await rawRecords(run.logA, run.threadId),
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
