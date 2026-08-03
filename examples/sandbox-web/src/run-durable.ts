/**
 * Durable-run wiring for the sandbox-web example — the journal-only tier of
 * durable runs (see docs/sandbox/durable-runs), in one module the routes share:
 *
 * - one `memoryPersistence()` so the run record, the transcript, and the
 *   delivery log all live in THIS process (zero infra — which also means a dev
 *   server restart forgets everything; that is the tier's documented trade);
 * - `buildRunStream`, the ONE chat() assembly both the fresh-run POST and the
 *   takeover GET use, so a replayed run re-derives the exact same stream;
 * - `driveRun`, the takeover drive (`durability.attach: true`) shared by the
 *   attach route and the reaper;
 * - `ensureReaper`, the scheduled sweep durable runs require (a detached run
 *   nobody rejoins must not keep its sandbox alive forever).
 *
 * The whole module is small because the stack is FIXED (Grok Build on Docker):
 * takeover requires rebuilding a run's chat() from its `runId` alone, and with
 * one adapter and one provider the rebuild is just `threadId` → sandbox +
 * transcript. Make the stack a per-request browser choice and every route that
 * arrives with only a `runId` needs that choice stored server-side — which is
 * most of the wiring this example used to carry.
 *
 * The `InMemoryLockStore` is fine here ONLY because this example is one
 * process. On real replicas it cannot stop two hosts driving one run — use a
 * distributed LockStore (see docs/sandbox/takeover, "Requirements").
 */
import { chat, memoryStream } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import {
  InMemorySandboxInstanceStore,
  JournalAttachUnavailableError,
  RunClaimNotAcquiredError,
  probeRunExit,
  reapDetachedRuns,
  sandboxRunDriver,
  withSandbox,
} from '@tanstack/ai-sandbox'
import {
  PREVIEW_GUIDANCE,
  buildAdapter,
  buildSandbox,
  makeExposePreviewTool,
  tanstackStartRecipe,
} from './sandbox-agent'
import { isTerminalRunStatus } from '@tanstack/ai'
import type {
  ModelMessage,
  RunDriverOptions,
  RunRecord,
  RunStore,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'
import type { RunExitProbe } from '@tanstack/ai-sandbox'

export const persistence = memoryPersistence()
export const { runs, messages: messageStore } = persistence.stores
export const locks = new InMemoryLockStore()

/**
 * ONE instance store, shared by every route, drive, and probe. This is what
 * gives the sandbox a cross-request identity: `buildSandbox()` mints a fresh
 * definition per call, and a definition's fallback bookkeeping is its own —
 * without a shared store, the takeover GET and every reaper probe `ensure` a
 * brand-new container instead of resuming the one the POST created (and the
 * takeover then waits on the empty journal of a sandbox nobody started).
 */
export const instances = new InMemorySandboxInstanceStore()

/**
 * Errors-only console logger for the run driver and the reaper. Both are
 * total-by-construction (a drive failure is logged, never thrown to the
 * response), so WITHOUT a logger a failed takeover is completely invisible —
 * the log stays open, the record stays `running`, and nothing prints.
 */
export const runLogger = resolveDebugOption(undefined)

/**
 * Runs THIS process is currently driving, for the cancel endpoint's fast path.
 * Only ever a fast path: the durable band (`requestRunCancel`) is what reaches
 * a run nobody is driving right now.
 */
export const driving = new Map<string, AbortController>()

/**
 * Mirror a claim/request signal onto a fresh AbortController for chat(), so a
 * lost claim (or a reaper budget) actually stops the drive.
 */
export function controllerFor(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  const abort = (): void => controller.abort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  return controller
}

/**
 * The one chat() assembly. `attach: false` starts the agent; `attach: true`
 * tails the run's existing journal instead of starting a second one. Same
 * sandbox, adapter, prompts, and tools either way — determinism is what lets a
 * takeover's replay align against the already-delivered log.
 */
export function buildRunStream(input: {
  threadId: string
  messages: Array<ModelMessage>
  runId: string
  abortController: AbortController
  attach: boolean
  durability: StreamDurability
  /** Grok session to resume for a follow-up turn (fresh runs only). */
  sessionId?: string
}): AsyncIterable<StreamChunk> {
  const { threadId, runId, abortController, attach, durability, sessionId } =
    input
  const sandbox = buildSandbox(threadId)

  return chat({
    threadId,
    // Forwarded, never generated here: the journal path, the deterministic
    // message ids, and the delivery-log stream name all derive from it.
    runId,
    adapter: buildAdapter(),
    messages: input.messages,
    systemPrompts: [PREVIEW_GUIDANCE],
    tools: [
      tanstackStartRecipe,
      makeExposePreviewTool(sandbox, threadId, { store: instances, locks }),
    ],
    ...(sessionId !== undefined ? { modelOptions: { sessionId } } : {}),
    abortController,
    middleware: [
      withPersistence(persistence),
      withLocks(locks),
      withSandbox(sandbox, {
        runs,
        instances,
        durability: {
          adapter: durability,
          ...(attach ? { attach: true } : {}),
        },
      }),
    ],
  }) as AsyncIterable<StreamChunk>
}

/**
 * The takeover drive, shaped for `sandboxRunDriver` and `reapDetachedRuns`:
 * rebuild the run's chat() from the persisted transcript, with `attach: true`.
 */
export async function* driveRun(input: {
  runId: string
  threadId: string
  signal: AbortSignal
}): AsyncIterable<StreamChunk> {
  const controller = controllerFor(input.signal)
  driving.set(input.runId, controller)
  console.log(`[driveRun] claimed ${input.runId}; starting attach drive`)
  try {
    // The client sent no history — it is reconnecting, not asking a question.
    const messages = await messageStore.loadThread(input.threadId)
    let restart = false
    try {
      const attachStream = buildRunStream({
        threadId: input.threadId,
        messages,
        runId: input.runId,
        abortController: controller,
        attach: true,
        durability: memoryStream({ runId: input.runId }),
      })
      for await (const chunk of attachStream) {
        // chat() reports a failed attach as an in-stream RUN_ERROR chunk (the
        // detached run has no caller to throw to). Intercept it BEFORE
        // yielding — a yielded chunk would be appended to the log and
        // delivered, turning a recoverable condition into a terminal error.
        if (isAttachUnavailableChunk(chunk)) {
          restart = true
          break
        }
        yield chunk
      }
      if (!restart) return
    } catch (error) {
      // The thrown shape of the same condition. Matched by `name`/`reason`
      // rather than `instanceof`: under vite dev the example's import of
      // `@tanstack/ai-sandbox` and the adapter's own can be two module
      // instances, and a cross-instance `instanceof` is always false.
      if (!isAttachUnavailableError(error)) throw error
      restart = true
    }
    // The claimed run has NO journal (or an empty one): its agent never wrote
    // a byte. The routine cause is a refresh during sandbox boot — the
    // original drive unwinds mid-setup, before the agent is even spawned, so
    // there is nothing to attach to and never will be. Nothing beyond the
    // run-accepted marker was delivered or stored, so restarting the run
    // FRESH (attach: false — start the agent) cannot duplicate anything the
    // client saw. Without this the run is a zombie: record `running`, log
    // open at the marker, every joiner parked until the reaper's TTL.
    console.warn(
      `[run-durable] attach found no journal for run ${input.runId} — its agent never started; restarting the run fresh`,
    )
    yield* buildRunStream({
      threadId: input.threadId,
      messages,
      runId: input.runId,
      abortController: controller,
      attach: false,
      durability: memoryStream({ runId: input.runId }),
    })
  } finally {
    driving.delete(input.runId)
  }
}

/** The two waited-then-gave-up preflight outcomes a fresh restart can fix. */
function isAttachUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === JournalAttachUnavailableError.name &&
    'reason' in error &&
    (error.reason === 'journal-timeout' || error.reason === 'journal-stalled')
  )
}

/**
 * The in-stream shape of `JournalAttachUnavailableError`'s recoverable cases.
 * The chunk carries no machine code (the error class exposes `reason`, which
 * `toRunErrorPayload` does not map), so this matches the class's stable
 * message prefix + the two waited-then-gave-up reasons' wording.
 */
function isAttachUnavailableChunk(chunk: StreamChunk): boolean {
  if (chunk.type !== 'RUN_ERROR') return false
  const message = 'message' in chunk ? chunk.message : undefined
  return (
    typeof message === 'string' &&
    message.startsWith('cannot attach to run') &&
    /journal/i.test(message)
  )
}

/**
 * Whether a detached run's agent already finished, by probing its journal tail
 * for the exit sentinel. `ensure` resumes the thread's sandbox (`reuse:
 * 'thread'`); if it had to CREATE one the probe finds no journal and answers
 * `producing` — the fail-safe direction, and the TTL still bounds the run.
 */
async function hasFinished(record: RunRecord): Promise<RunExitProbe> {
  try {
    const handle = await buildSandbox(record.threadId).ensure({
      threadId: record.threadId,
      runId: 'run',
      // The SHARED bookkeeping, so this resumes the run's real sandbox instead
      // of creating a fresh (journal-less) one per probe.
      store: instances,
      locks,
    })
    return await probeRunExit({ handle, runId: record.runId })
  } catch (error) {
    return { state: 'unknown', error }
  }
}

/** Tear the reclaimed run's sandbox down through the same definition that built it. */
function reclaim(record: RunRecord): Promise<void> {
  return buildSandbox(record.threadId).destroy({
    threadId: record.threadId,
    runId: 'run',
    store: instances,
    locks,
  })
}

const CLAIM_RETRY_MS = 3_000
/** ~2 minutes of retries — spans a slow sandbox boot with room to spare. */
const CLAIM_RETRY_LIMIT = 40

/**
 * The takeover driver for the attach GET: `sandboxRunDriver` with a RETRYING
 * claim.
 *
 * Core's driver tries the claim exactly once and — correctly — declines to
 * drive when another host holds it. But on a refresh during sandbox boot the
 * holder is the run's ORIGINAL drive, which only observes its own disconnect
 * once the boot completes; the client has already attached to the log by then,
 * so nothing ever issues another attach and the run is stranded. Retrying the
 * claim (bounded, and abandoned the moment the run settles or a cancel is
 * recorded) bridges that window: when the original drive finally detaches and
 * releases, this driver claims, finds no journal, and `driveRun` restarts the
 * agent.
 */
export function takeoverDriver(request: Request): RunDriverOptions {
  const base = sandboxRunDriver({
    request,
    runs,
    locks,
    durability: () => memoryStream(request),
    drive: driveRun,
    // The driver is total: a failed drive is logged, never thrown to the
    // (already streaming) response. Without a logger the failure is invisible.
    logger: runLogger,
  })
  return {
    ...base,
    claim: async <T>(
      input: { runs: RunStore; locks: LockStore; runId: string },
      fn: (claim: {
        runId: string
        epoch: number
        signal: AbortSignal
      }) => Promise<T>,
    ): Promise<T> => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await base.claim(input, fn)
        } catch (error) {
          if (
            !(error instanceof RunClaimNotAcquiredError) ||
            attempt >= CLAIM_RETRY_LIMIT
          ) {
            throw error
          }
          console.log(
            `[takeover] claim for ${input.runId} refused (attempt ${attempt + 1}); retrying — the original drive likely still holds it`,
          )
          await new Promise((resolve) => setTimeout(resolve, CLAIM_RETRY_MS))
          // Re-check between attempts: retrying past a settle would be noise,
          // and retrying past a CANCEL would resurrect a run the user stopped.
          const record = await runs.get(input.runId)
          if (
            record === null ||
            isTerminalRunStatus(record.status) ||
            record.cancelRequested === true
          ) {
            throw error
          }
        }
      }
    },
  }
}

const SWEEP_INTERVAL_MS = 60_000

let reaperStarted = false
let sweepInFlight = false

/**
 * Schedule the detached-run sweep — the second, easy-to-forget half of the
 * durable-runs opt-in (see docs/sandbox/reaping). Guarded so overlapping ticks
 * never race for the same claims. Call it from the run routes; the first call
 * arms it for the life of the dev server.
 */
export function ensureReaper(): void {
  if (reaperStarted) return
  reaperStarted = true
  setInterval(() => {
    if (sweepInFlight) return
    sweepInFlight = true
    void reapDetachedRuns({
      runs,
      locks,
      durability: (runId) => memoryStream({ runId }),
      hasFinished,
      drive: driveRun,
      logger: runLogger,
      now: Date.now(),
      // Short for a demo: a run nobody rejoins is finalized (or expired and its
      // sandbox destroyed) within ~5 minutes of its last viewer leaving.
      detachedRunTtlMs: 5 * 60_000,
      maxRuns: 5,
      reclaim,
    })
      .then((result) => {
        if (result.considered > 0) console.log('[reaper]', result)
      })
      .catch((error: unknown) => console.error('[reaper] sweep failed:', error))
      .finally(() => {
        sweepInFlight = false
      })
  }, SWEEP_INTERVAL_MS).unref?.()
}
