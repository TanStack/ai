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
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import {
  probeRunExit,
  reapDetachedRuns,
  withSandbox,
} from '@tanstack/ai-sandbox'
import {
  PREVIEW_GUIDANCE,
  buildAdapter,
  buildSandbox,
  makeExposePreviewTool,
  tanstackStartRecipe,
} from './sandbox-agent'
import type {
  ModelMessage,
  RunRecord,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'
import type { RunExitProbe } from '@tanstack/ai-sandbox'

export const persistence = memoryPersistence()
export const { runs, messages: messageStore } = persistence.stores
export const locks = new InMemoryLockStore()

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
    tools: [tanstackStartRecipe, makeExposePreviewTool(sandbox, threadId)],
    ...(sessionId !== undefined ? { modelOptions: { sessionId } } : {}),
    abortController,
    middleware: [
      withPersistence(persistence),
      withLocks(locks),
      withSandbox(sandbox, {
        runs,
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
  try {
    yield* buildRunStream({
      threadId: input.threadId,
      // The client sent no history — it is reconnecting, not asking a question.
      messages: await messageStore.loadThread(input.threadId),
      runId: input.runId,
      abortController: controller,
      attach: true,
      durability: memoryStream({ runId: input.runId }),
    })
  } finally {
    driving.delete(input.runId)
  }
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
  })
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
