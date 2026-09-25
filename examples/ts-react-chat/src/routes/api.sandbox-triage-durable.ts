import { createFileRoute } from '@tanstack/react-router'
import {
  chatParamsFromRequestBody,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { reconstructChat, withPersistence } from '@tanstack/ai-persistence'
import type { StreamChunk } from '@tanstack/ai'
import { persistentChatPersistence } from '../lib/persistent-chat-store'

/**
 * The DURABLE twin of `/api/sandbox-triage`.
 *
 * Same harness × provider matrix, same triage prompt. The difference is what a
 * client disconnect means. On the plain route, an abort destroys the sandbox and
 * the work is gone. Here the run is durable, so a disconnect DETACHES it: the
 * agent keeps working, the sandbox stays up, and a later request takes the run
 * over and streams the remainder. Refresh the page mid-run and watch it continue.
 *
 * Read [Durable Runs Explained](../../../docs/sandbox/durable-runs.md) for the
 * model, and `docs/sandbox/takeover.md` for the production wiring.
 *
 * Three things make a run durable, and all three are visible below:
 *
 * 1. `withSandbox(sandbox, { runs, durability })` — BOTH options. Either alone is
 *    not durable and silently keeps the destroy-on-disconnect behavior.
 * 2. `runId` forwarded into `chat()`. The journal path, the message ids, and the
 *    delivery log name all derive from it, so a successor can only resume a run
 *    whose id it can recompute.
 * 3. The durability adapter addresses the same log on both seams. `memoryStream`
 *    keys its log by `runId`, so two handles for one run ARE one log — but a
 *    backend that holds per-instance state (`durableStream`) is not so forgiving,
 *    which is why `durabilityFor(runId)` is the single place a handle is made.
 *
 * DEMO CAVEATS, deliberately not hidden:
 *
 * - `memoryStream` is process-local. A real deployment swaps in
 *   `durableStream(request, { server })` from `@tanstack/ai-durable-stream` so
 *   every replica can read the same log.
 * - `InMemoryLockStore` cannot coordinate across hosts; `withSandbox` warns about
 *   exactly this pairing. Fine for one dev server, wrong for production.
 * - Nothing here schedules `reapDetachedRuns`, so a run you abandon is never
 *   finalized and its sandbox is never reclaimed. That is the single easiest
 *   mistake to make with this feature (see `docs/sandbox/reaping.md`), and this
 *   route leaves it undone on purpose rather than pretending it is automatic.
 *   Use the `keepAlive: false` default and destroy stray sandboxes yourself.
 */

const persistence = persistentChatPersistence()
const locks = new InMemoryLockStore()

/**
 * How long a from-start join waits for the run's FIRST chunk before failing.
 *
 * The 100ms default is tuned for chat, where the doc's assumption holds — "an
 * in-flight run's log already holds chunks (it streams immediately, deadline never
 * applies) and an empty log means the run is gone". A SANDBOXED run breaks that
 * assumption completely: it emits nothing at all until `withSandbox`'s `ensure`
 * has created the sandbox and cloned the repo, which is minutes. Rejoin the thread
 * in that window and the join fast-failed with "Memory stream run produced no data
 * within 100ms" — reporting a perfectly healthy run as gone.
 *
 * This is the case `firstChunkDeadlineMs` was written for: "raise it for backends
 * where a producer legitimately starts well after a joiner attaches". Failing fast
 * is not needed here anyway, because the client only joins a run the server has
 * already confirmed active via `findActiveRun` (the `?statuses=` branch below), so
 * "the run is gone" is excluded before the join is even attempted.
 */
const SANDBOX_FIRST_CHUNK_DEADLINE_MS = 15 * 60_000

/** One durability handle per run, keyed by runId. */
function durabilityFor(runId: string) {
  return memoryStream(
    { runId },
    { firstChunkDeadlineMs: SANDBOX_FIRST_CHUNK_DEADLINE_MS },
  )
}

interface TriageData {
  harness: unknown
  provider: unknown
  issueUrl: unknown
  keepAlive: unknown
  useSubscription: unknown
  grokModel: unknown
  grokProtocol: unknown
  grokTransport: unknown
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Build the triage stream for a run. */
async function buildTriageStream(
  data: TriageData,
  input: {
    runId: string
    threadId: string
  },
): Promise<AsyncIterable<StreamChunk>> {
  const [{ chat }, { withSandbox }, triage, { createTriageTools }] =
    await Promise.all([
      import('@tanstack/ai'),
      import('@tanstack/ai-sandbox'),
      import('../sandbox-triage'),
      import('../triage-tools'),
    ])
  const {
    PROVIDERS,
    buildHarnessAdapter,
    buildSandbox,
    buildTriagePrompt,
    fetchIssue,
    isHarness,
    isProvider,
    parseIssueUrl,
  } = triage
  const { isGrokModel, isGrokProtocol, isGrokTransport } =
    await import('../sandbox-triage-options')

  if (!isHarness(data.harness) || !isProvider(data.provider)) {
    throw new Error('Unknown harness or provider.')
  }
  if (typeof data.issueUrl !== 'string') {
    throw new Error('issueUrl is required.')
  }
  const { repo, issueNumber } = parseIssueUrl(data.issueUrl)
  const issue = await fetchIssue(repo, issueNumber)

  const sandbox = buildSandbox({
    harness: data.harness,
    provider: data.provider,
    repo,
    threadId: input.threadId,
    keepAlive: data.keepAlive === true,
    useSubscription: data.useSubscription === true,
  })

  // The host tool bridge is a localhost server, so only same-machine providers
  // reach it. Skipping the tools for remote providers keeps the agent from
  // flailing on tools it can never call. (The plain route can also tunnel via
  // ngrok; omitted here to keep the durability wiring the only new thing.)
  const triageTools = PROVIDERS[data.provider].toolBridge
    ? createTriageTools(repo, issueNumber)
    : null

  const durability = durabilityFor(input.runId)

  // NO `abortController` MIRRORING `request.signal`, deliberately — and this is
  // the whole point of the durable route.
  //
  // The plain route mirrors it, because there a disconnect SHOULD end the run. Here
  // it must not. Aborting the run on disconnect makes `chat()` return at its
  // `isCancelled()` check immediately after `withSandbox.setup`, so the harness
  // adapter's `chatStream` is never called and the agent in the sandbox we just
  // spent minutes creating is never launched. Switch away while the UI still says
  // "starting the sandbox" and you come back to an empty log for a run that did
  // nothing — and no takeover can recover it, because an agent that never started
  // wrote no journal to replay.
  //
  // The disconnect still reaches `withSandbox`: core notifies the run through its
  // internal disconnect seam the moment the response body is cancelled, WITHOUT
  // aborting it. `withSandbox` stamps `detachedSince`/`sandboxKey` and publishes
  // the detach verdict, the producer keeps draining the agent into the still-open
  // delivery log, and a rejoining client tails that log to the real terminal.
  //
  // A genuine Stop is unaffected: it arrives out of band
  // (`RunRecord.cancelRequested` / `RUN_CANCEL_REASON`), which is the only channel
  // that can distinguish "the user wants this stopped" from "the user closed a tab"
  // — they are the identical socket close on the wire.
  return chat({
    threadId: input.threadId,
    // Load-bearing: the journal path and the delivery log both derive from it.
    runId: input.runId,
    adapter: buildHarnessAdapter(
      data.harness,
      data.provider,
      data.harness === 'grok'
        ? {
            model: isGrokModel(data.grokModel)
              ? data.grokModel
              : 'composer-2.5',
            protocol: isGrokProtocol(data.grokProtocol)
              ? data.grokProtocol
              : 'acp',
            transport: isGrokTransport(data.grokTransport)
              ? data.grokTransport
              : 'auto',
          }
        : undefined,
    ),
    messages: [{ role: 'user', content: buildTriagePrompt(issue, repo) }],
    middleware: [
      // The transcript, so a reload rehydrates prior turns (the delivery log
      // holds one run, never history).
      withPersistence(persistence, { snapshotStreaming: true }),
      withLocks(locks),
      // The durability opt-in. `runs` is the SAME store chat persistence uses, so
      // one record describes the run instead of two that can disagree.
      withSandbox(sandbox, {
        runs: persistence.stores.runs,
        durability: { adapter: durability },
      }),
    ],
    ...(triageTools
      ? {
          tools: triageTools.tools,
          systemPrompts: [
            triageTools.mandate,
            triageTools.codeModeSystemPrompt,
          ],
        }
      : {}),
  })
}

export const Route = createFileRoute('/api/sandbox-triage-durable')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let data: TriageData
        let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
        try {
          const body = (await request.json()) as {
            data?: TriageData
            forwardedProps?: TriageData
          }
          const layer = body.data ?? body.forwardedProps
          if (layer == null || typeof layer !== 'object') {
            throw new Error('body.data (or forwardedProps) is required')
          }
          data = layer
          params = await chatParamsFromRequestBody(body)
        } catch (error) {
          return json(
            400,
            error instanceof Error ? error.message : 'invalid body',
          )
        }

        const missing = await (async () => {
          const { missingEnv, isHarness, isProvider } =
            await import('../sandbox-triage')
          if (!isHarness(data.harness) || !isProvider(data.provider)) return []
          return missingEnv(data.harness, data.provider)
        })()
        if (missing.length > 0) {
          return json(
            500,
            `Missing required env: ${missing.join(', ')}. Set it and restart the dev server.`,
          )
        }

        try {
          const stream = await buildTriageStream(data, {
            runId: params.runId,
            threadId: params.threadId,
          })
          // The SAME adapter instance the middleware got, so the journal and the
          // delivery log are provably one run.
          return toServerSentEventsResponse(stream, {
            durability: { adapter: durabilityFor(params.runId) },
          })
        } catch (error) {
          console.error('[api/sandbox-triage-durable] error:', error)
          return json(502, error instanceof Error ? error.message : 'run error')
        }
      },

      // One GET, two jobs — the SAME split as `/api/persistent-chat`, and
      // deliberately no more than that:
      //
      // 1. REPLAY (`?runId=…&offset=-1`, or an `X-Run-Id` + `Last-Event-ID`
      //    reconnect). Tail the run's delivery log from the start. That is all a
      //    reattach needs here, because a detached run's producer KEEPS PUMPING
      //    into that log — core drains the agent into it after the reader leaves
      //    (`stream-to-response.ts`: "the reader is gone but we keep pulling to
      //    drain the producer into the durable log"). So a refresh gets the
      //    remainder by reading, with no rebuild and nothing stored.
      // 2. HYDRATION (`?threadId=…`). The durable transcript plus a cursor to any
      //    in-flight run, which is what a `persistence: true` client fetches on
      //    mount and then tails through branch 1.
      //
      // WHEN YOU WOULD ADD `sandboxRunDriver`: only when the host that was
      // pumping is GONE — a restart, or a different replica — because then the
      // log stops growing and the in-sandbox journal is the only source of the
      // remainder. A successor claims the run, replays the journal, aligns it
      // against the log, and appends what is missing. That is a multi-host
      // concern, so it stays out of a single-dev-server example; see
      // `docs/sandbox/takeover.md` for that wiring.
      GET: async ({ request }) => {
        const url = new URL(request.url)

        // 0. STATUS for the sidebar: `?statuses=a,b,c` → per-thread run state, so
        //    the thread list can show running/idle without opening each thread.
        //    Straight off `runs.findActiveRun`, which is exactly the "does this
        //    thread have a live run?" query and is REQUIRED on the contract.
        const statuses = url.searchParams.get('statuses')
        if (statuses !== null) {
          const ids = statuses.split(',').filter((id) => id !== '')
          const entries = await Promise.all(
            ids.map(async (threadId) => {
              try {
                const active =
                  await persistence.stores.runs.findActiveRun(threadId)
                return [
                  threadId,
                  active
                    ? {
                        status: 'running',
                        runId: active.runId,
                        // Present when nobody is watching: the run is alive but
                        // detached, which is worth showing differently from a
                        // run someone is actively tailing.
                        detached: active.detachedSince !== undefined,
                      }
                    : { status: 'idle' },
                ] as const
              } catch {
                // One unreadable thread must not blank the whole sidebar.
                return [threadId, { status: 'unknown' }] as const
              }
            }),
          )
          return new Response(JSON.stringify(Object.fromEntries(entries)), {
            headers: { 'content-type': 'application/json' },
          })
        }

        // The SAME deadline as the POST side, and this is the call that actually
        // needs it: this is the join, so this is where a from-start rejoin waits for
        // the run's first chunk. Leaving it at the 100ms default here is what made a
        // rejoin during sandbox setup fail with "produced no data within 100ms".
        const durability = memoryStream(request, {
          firstChunkDeadlineMs: SANDBOX_FIRST_CHUNK_DEADLINE_MS,
        })
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        // Demo only: single shared thread, no multi-user auth. A production route
        // must authorize ownership before load.
        return reconstructChat(persistence, request, {
          authorize: async (threadId) => threadId.length > 0,
        })
      },
    },
  },
})
