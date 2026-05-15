import { bindAgents } from '../primitives/bind-agents'
import { LogConflictError } from '../types'
import { diffState, snapshotState } from './state-diff'
import { fingerprintWorkflow } from './fingerprint'
import {
  approvalRequestedEvent,
  customEvent,
  runErrorEvent,
  runFinishedEvent,
  runStartedEvent,
  stateDeltaEvent,
  stateSnapshotEvent,
  stepFinishedEvent,
  stepStartedEvent,
} from './emit-events'
import { invokeAgent } from './invoke-agent'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AgentMap,
  AnyWorkflowDefinition,
  ApprovalResult,
  LiveRun,
  RunState,
  SignalResult,
  StepDescriptor,
  StepRecord,
  StepRetryOptions,
  WorkflowRunArgs,
} from '../types'
import type { InMemoryRunStore } from '../run-store/in-memory'

export interface RunWorkflowOptions {
  workflow: AnyWorkflowDefinition
  runStore: InMemoryRunStore
  /** First-call: provide `input`. Resume-call: provide `runId` + either
   *  `approval` (legacy) or `signalDelivery` (generic). Attach-call:
   *  provide `runId` + `attach: true`. */
  input?: unknown
  runId?: string
  approval?: ApprovalResult
  /**
   * Generic signal delivery (Q5). Resumes a run paused on
   * `waitForSignal(name)` by delivering `payload` as the yield's value.
   * `signalId` is the host's idempotency token for this delivery. When
   * both `approval` and `signalDelivery` are provided, `signalDelivery`
   * wins — `approval` is retained as a typed wrapper for the
   * '__approval' signal.
   */
  signalDelivery?: SignalResult
  /**
   * Attach to an existing run (Q7). Synthesizes RUN_STARTED +
   * STATE_SNAPSHOT + STEPS_SNAPSHOT from the persisted log so a fresh
   * subscriber (browser tab refresh, shared link, mobile reconnect)
   * can rebuild its UI from scratch. After the snapshot:
   *   - paused runs: emit run.paused and end the stream
   *   - finished/errored runs: emit RUN_FINISHED/RUN_ERROR and end
   *   - in-process running runs: tail the live event stream (the host
   *     ran the original start/resume on the same node)
   *   - cross-node running runs: emit a final status hint and end —
   *     hosts that need cross-node tailing wire the publisher hook
   *     and subscribe to it themselves
   */
  attach?: boolean
  /** Optional: external abort signal. */
  signal?: AbortSignal
  /** Optional: thread ID for client-side correlation. */
  threadId?: string
  /**
   * Optional: called with the workflow's final output value before the store
   * entry is deleted. Used by the parent engine to capture nested-workflow
   * output across the store-delete boundary.
   */
  outputSink?: (output: unknown) => void
  /**
   * Optional event publisher hook (Q7). Called once per event emitted
   * by the engine, before the event is yielded to the SSE consumer.
   * Hosts wire this to a fan-out transport (Redis pub/sub, NATS,
   * EventBridge, etc.) so attached subscribers on *other* nodes can
   * tail live events. Errors thrown by `publish` are caught and
   * logged but do not break the run — the SSE consumer still gets
   * the event.
   *
   * Single-node deployments can ignore this. Multi-node deployments
   * use it as the seam where the library doesn't ship transport.
   */
  publish?: (runId: string, event: StreamChunk) => void | Promise<void>
}

// ----- helpers -----

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function mergeStateDefaults(
  workflow: AnyWorkflowDefinition,
  initial: Record<string, unknown>,
): Record<string, unknown> {
  if (workflow.stateSchema) {
    const validated = workflow.stateSchema['~standard'].validate(initial)
    if (!(validated instanceof Promise) && !validated.issues) {
      return validated.value as Record<string, unknown>
    }
  }
  return initial
}

function serializeError(err: unknown): {
  name: string
  message: string
  stack?: string
} {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  return { name: 'UnknownError', message: String(err) }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Compute the wait between retry attempts. `attempt` is the *just-
 * failed* attempt number (1-indexed), so the next attempt happens
 * after `delay(attempt)` ms.
 */
function computeBackoffMs(
  policy: StepRetryOptions | undefined,
  attempt: number,
): number {
  if (!policy) return 0
  const base = policy.baseMs ?? 500
  if (typeof policy.backoff === 'function') return policy.backoff(attempt)
  if (policy.backoff === 'fixed') return base
  // Default: exponential. attempt=1 -> base, attempt=2 -> base*2, …
  return base * 2 ** (attempt - 1)
}

/**
 * Reconstruct the initial state for a workflow. Used both on start (fresh
 * run) and on replay-from-store resume (recover state from scratch by
 * re-running `initialize` + re-applying user-code mutations via replay).
 *
 * Replay determinism relies on this returning the same shape every time
 * for a given input — `initialize` should be pure given its arguments.
 */
function buildInitialState(
  workflow: AnyWorkflowDefinition,
  input: unknown,
): Record<string, unknown> {
  const initial = workflow.initialize
    ? workflow.initialize({ input: input as never })
    : {}
  return mergeStateDefaults(workflow, initial as Record<string, unknown>)
}

/**
 * Run a workflow to completion or pause point (start or resume). Returns
 * an AsyncIterable of StreamChunk that the caller pipes to SSE.
 *
 * - Start call: provide `workflow`, `input`, and `runStore`.
 * - Resume call: provide `workflow`, `runId`, `approval`, and `runStore`.
 *
 * Pause semantics: when the user code yields an `approval` descriptor,
 * the engine emits `approval-requested`, persists run state, stores the
 * live generator handle in `runStore.setLive`, then ends the stream. The
 * client resumes by calling `runWorkflow` again with `runId` and
 * `approval`.
 *
 * Durability: every completed step (`agent`, `nested-workflow`,
 * `approval`) is appended to the run's step log via `runStore.appendStep`
 * *before* the corresponding `STEP_FINISHED` is emitted (Q6: at-most-once
 * observable). On resume, if the live generator is gone (process
 * restart, multi-instance routing), the engine reconstructs by reading
 * the log and replaying user code, short-circuiting each yielded
 * descriptor with its recorded result.
 */
export async function* runWorkflow(
  options: RunWorkflowOptions,
): AsyncIterable<StreamChunk> {
  // Inner generator does the actual work; the outer wrapper intercepts
  // every event so the publisher hook (Q7) sees every emission before
  // the SSE consumer does. We track the runId as it emerges from
  // RUN_STARTED so the publish callback always carries the right key
  // (start-paths don't know the runId at construction time).
  async function* inner(): AsyncIterable<StreamChunk> {
    if (options.runId && options.attach) {
      yield* attachRun(options)
      return
    }
    if (options.runId && (options.approval || options.signalDelivery)) {
      yield* resumeRun(options)
      return
    }
    if (options.input === undefined) {
      throw new Error(
        'runWorkflow: provide `input` (start), `runId` + `approval`/`signalDelivery` (resume), or `runId` + `attach: true` (attach)',
      )
    }
    yield* startRun(options as RunWorkflowOptions & { input: unknown })
  }

  let knownRunId = options.runId
  for await (const event of inner()) {
    if (event.type === 'RUN_STARTED' && !knownRunId) {
      knownRunId = (event as unknown as { runId: string }).runId
    }
    if (options.publish && knownRunId) {
      try {
        await options.publish(knownRunId, event)
      } catch {
        // Swallow — a misbehaving publisher must not break the run.
      }
    }
    yield event
  }
}

async function* startRun(
  options: RunWorkflowOptions & { input: unknown },
): AsyncIterable<StreamChunk> {
  const runId = options.runId ?? generateId('run')
  const fingerprint = fingerprintWorkflow(options.workflow)

  // Idempotency check (Q8): if the client provided a runId and a run
  // already exists with that id, either treat this call as a retry (the
  // fingerprint matches → the original start succeeded; we deliver an
  // attach snapshot so the caller sees the run as it stands), or reject
  // with RUN_ID_CONFLICT (the fingerprint doesn't match — most likely a
  // collision rather than a true retry). Generated runIds skip this
  // check because their probabilistic collision rate is negligible and
  // the cost (one store read per fresh start) isn't worth paying.
  if (options.runId) {
    const existing = await options.runStore.getRunState(runId)
    if (existing) {
      if (existing.fingerprint && existing.fingerprint !== fingerprint) {
        yield runErrorEvent({
          runId,
          message: `Run id "${runId}" already exists with a different workflow fingerprint. Generate a fresh runId or use \`attach: true\` to read the existing run.`,
          code: 'run_id_conflict',
        })
        return
      }
      // Same runId, same fingerprint → idempotent retry. Serve the
      // current state via the attach path so callers always get a
      // consistent envelope of events regardless of whether they hit
      // a fresh start or a retry.
      yield* attachRun({ ...options, attach: true })
      return
    }
  }

  const abortController = new AbortController()
  if (options.signal) {
    options.signal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })
  }

  const state = buildInitialState(options.workflow, options.input)

  const runState: RunState = {
    runId,
    status: 'running',
    workflowName: options.workflow.name,
    fingerprint,
    input: options.input,
    state,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await options.runStore.setRunState(runId, runState)

  yield runStartedEvent({ runId, threadId: options.threadId })
  yield stateSnapshotEvent({ snapshot: state })

  const live: LiveRun = {
    runState,
    generator: undefined as unknown as LiveRun['generator'],
    abortController,
    approvalResolver: undefined,
    pendingEvents: [],
  }

  const args: WorkflowRunArgs<unknown, unknown, AgentMap> = {
    input: options.input,
    state,
    agents: bindAgents(options.workflow.agents),
    emit: (name, value) => {
      live.pendingEvents.push({
        type: 'CUSTOM',
        timestamp: Date.now(),
        name,
        value,
      } as StreamChunk)
    },
    signal: abortController.signal,
  }

  const generator = options.workflow.run(args as any)
  live.generator = generator
  options.runStore.setLive(runId, live)

  yield* driveLoop({
    live,
    runId,
    state,
    runStore: options.runStore,
    threadId: options.threadId,
    outputSink: options.outputSink,
    abortController,
    seedValue: undefined,
    replayLog: [],
    workflow: options.workflow,
  })
}

/**
 * Read-only subscribe to an existing run (Q7).
 *
 * Emits a synthetic snapshot package — RUN_STARTED + STATE_SNAPSHOT +
 * `steps-snapshot` (CUSTOM with all completed step records) — so a
 * fresh subscriber can rebuild its UI without needing per-token
 * streaming history. After the snapshot:
 *   - finished/errored runs emit the terminal event and end.
 *   - paused runs emit `run.paused` and end (host watches the store
 *     or publisher hook for the wake).
 *   - in-process running runs tail live SSE chunks via the publisher
 *     hook (only attempted when the publisher is provided).
 *   - cross-node running runs emit a status hint and end.
 *
 * Per-token streaming history (TEXT_MESSAGE_CONTENT deltas inside an
 * agent step) is not persisted; on attach mid-step, the client sees
 * STEP_STARTED with no prior tokens and then live tokens from the
 * attach point onward (or, more typically, the run finishes between
 * the snapshot emit and the publisher subscription and the client
 * sees STEP_FINISHED in the snapshot's STEPS_SNAPSHOT).
 */
async function* attachRun(
  options: RunWorkflowOptions,
): AsyncIterable<StreamChunk> {
  const runId = options.runId!
  const persistedRunState = await options.runStore.getRunState(runId)
  if (!persistedRunState) {
    yield runErrorEvent({
      runId,
      message: `Run ${runId} not found (expired or never existed)`,
      code: 'run_lost',
    })
    return
  }

  // Surface RUN_STARTED so clients always see a consistent stream
  // opener, regardless of whether they're starting / resuming /
  // attaching. The runId on the event matches the persisted one.
  yield runStartedEvent({ runId, threadId: options.threadId })
  yield stateSnapshotEvent({ snapshot: persistedRunState.state })

  // STEPS_SNAPSHOT is a single CUSTOM event carrying all completed
  // step records so the client can rebuild its WorkflowTimeline from
  // scratch. The 'steps-snapshot' name is the wire-format key.
  const steps = await options.runStore.getSteps(runId)
  yield customEvent({
    name: 'steps-snapshot',
    value: {
      steps: steps.map((r) => ({
        index: r.index,
        kind: r.kind,
        name: r.name,
        result: r.result,
        error: r.error,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
      })),
    },
  })

  if (persistedRunState.status === 'finished') {
    yield runFinishedEvent({
      runId,
      threadId: options.threadId,
      output: persistedRunState.output,
    })
    return
  }
  if (
    persistedRunState.status === 'error' ||
    persistedRunState.status === 'aborted'
  ) {
    yield runErrorEvent({
      runId,
      message:
        persistedRunState.error?.message ??
        `Run ${runId} ended with status ${persistedRunState.status}`,
      code:
        persistedRunState.status === 'aborted' ? 'aborted' : 'error',
    })
    return
  }
  if (persistedRunState.status === 'paused') {
    // Re-emit the pause notice so the attaching client knows what to
    // wake the run with. The originating SSE response already emitted
    // this on the prior connection — this subscriber didn't see that.
    yield customEvent({
      name: 'run.paused',
      value: {
        runId,
        signalName:
          persistedRunState.waitingFor?.signalName ??
          (persistedRunState.pendingApproval ? '__approval' : 'unknown'),
        deadline: persistedRunState.waitingFor?.deadline,
        kind: persistedRunState.pendingApproval
          ? 'approval'
          : persistedRunState.waitingFor?.signalName === '__timer'
            ? 'sleep'
            : 'signal',
        meta:
          persistedRunState.waitingFor?.meta ??
          (persistedRunState.pendingApproval
            ? {
                title: persistedRunState.pendingApproval.title,
                description: persistedRunState.pendingApproval.description,
              }
            : undefined),
      },
    })
    return
  }

  // status === 'running'. We can only tail if the executing generator
  // lives in this process. Cross-node attach lands when the publisher
  // hook is wired (Q7 step 7) — for v1 single-node, the snapshot
  // above is the useful payload and we end the stream.
  yield customEvent({
    name: 'run.current-status',
    value: {
      runId,
      status: 'running',
      note:
        'Run is executing on another node (or this process is read-only). Wire the publisher hook to tail live events.',
    },
  })
}

async function* resumeRun(
  options: RunWorkflowOptions,
): AsyncIterable<StreamChunk> {
  const runId = options.runId!
  // `signalDelivery` is the generic path (Q5); `approval` remains as a
  // typed shorthand for the '__approval' descriptor that today's
  // `approve()` primitive yields. Either one resolves the pending pause
  // — they're never both meaningful, and signalDelivery wins when both
  // are passed (callers are migrating from one to the other).
  const seedPayload: unknown =
    options.signalDelivery !== undefined
      ? options.signalDelivery.payload
      : options.approval

  // Fast path: live generator still in process (same node, no restart).
  const inMemory = options.runStore.getLive(runId)
  if (inMemory) {
    inMemory.runState = {
      ...inMemory.runState,
      status: 'running',
      updatedAt: Date.now(),
    }
    await options.runStore.setRunState(runId, inMemory.runState)

    yield runStartedEvent({ runId, threadId: options.threadId })

    yield* driveLoop({
      live: inMemory,
      runId,
      state: inMemory.runState.state as Record<string, unknown>,
      runStore: options.runStore,
      threadId: options.threadId,
      outputSink: options.outputSink,
      abortController: inMemory.abortController,
      seedValue: seedPayload,
      seedSignalId: options.signalDelivery?.signalId,
      replayLog: [],
      workflow: options.workflow,
    })
    return
  }

  // Replay path: live generator is gone (process restart, multi-node
  // routing). Reconstruct by loading state + log from the store, re-
  // running the workflow from scratch, short-circuiting each yielded
  // step with its recorded log entry.
  const persistedRunState = await options.runStore.getRunState(runId)
  if (!persistedRunState) {
    yield runErrorEvent({
      runId,
      message: `Run ${runId} not found (expired or never existed)`,
      code: 'run_lost',
    })
    return
  }

  // Workflow source fingerprint guard: if the deployed code drifted
  // since this run was started, refuse resume with a clear error. The
  // operator's recovery options are drain-then-deploy (refuse new runs
  // until in-flight ones finish) or, for irrecoverable runs, mark the
  // run errored manually. A future `patched()` escape hatch (Temporal
  // style) is documented as a v2 follow-up but not implemented here.
  const currentFingerprint = fingerprintWorkflow(options.workflow)
  if (
    persistedRunState.fingerprint &&
    persistedRunState.fingerprint !== currentFingerprint
  ) {
    yield runErrorEvent({
      runId,
      message: `Workflow source changed since run ${runId} was started (fingerprint ${persistedRunState.fingerprint} -> ${currentFingerprint}). Refusing resume.`,
      code: 'workflow_version_mismatch',
    })
    return
  }

  const replayLog = await options.runStore.getSteps(runId)

  // Rebuild fresh state. The persisted snapshot would otherwise compound
  // with the re-execution of user-code state mutations — replay restores
  // state authoritatively by re-running the workflow from initial state
  // against the log. Determinism contract: `initialize` is pure.
  const state = buildInitialState(options.workflow, persistedRunState.input)

  const abortController = new AbortController()
  if (options.signal) {
    options.signal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })
  }

  const live: LiveRun = {
    runState: { ...persistedRunState, status: 'running', updatedAt: Date.now() },
    generator: undefined as unknown as LiveRun['generator'],
    abortController,
    approvalResolver: undefined,
    pendingEvents: [],
  }

  const args: WorkflowRunArgs<unknown, unknown, AgentMap> = {
    input: persistedRunState.input,
    state,
    agents: bindAgents(options.workflow.agents),
    emit: (name, value) => {
      live.pendingEvents.push({
        type: 'CUSTOM',
        timestamp: Date.now(),
        name,
        value,
      } as StreamChunk)
    },
    signal: abortController.signal,
  }

  const generator = options.workflow.run(args as any)
  live.generator = generator
  options.runStore.setLive(runId, live)
  await options.runStore.setRunState(runId, live.runState)

  yield runStartedEvent({ runId, threadId: options.threadId })

  yield* driveLoop({
    live,
    runId,
    state,
    runStore: options.runStore,
    threadId: options.threadId,
    outputSink: options.outputSink,
    abortController,
    seedValue: seedPayload,
    seedSignalId: options.signalDelivery?.signalId,
    replayLog,
    workflow: options.workflow,
  })
}

interface DriveLoopArgs {
  live: LiveRun
  runId: string
  /** Same reference the user generator's `args.state` holds. */
  state: Record<string, unknown>
  runStore: InMemoryRunStore
  threadId?: string
  outputSink?: (output: unknown) => void
  abortController: AbortController
  /**
   * Value to send into the *post-replay* `generator.next(...)`. For start,
   * undefined. For resume, the `approval` (or, in later milestones, the
   * signal payload). Replay itself ignores it; it's consumed exactly once
   * to satisfy the descriptor that was awaiting when the run paused.
   */
  seedValue: unknown
  /** Idempotency token for the seed delivery (Q8). Recorded on the
   *  resulting approval/signal step record so a subsequent retry with
   *  the same signalId can be deduped to the existing entry (CAS-on-
   *  conflict handling lands in step 9). */
  seedSignalId?: string
  /**
   * Recorded step results from a prior run instance. Empty for fresh
   * starts and in-memory resumes. Non-empty for replay-after-restart:
   * each entry short-circuits the next yielded descriptor without
   * dispatching the work again. Entries are positionally indexed
   * (cursor 0 = first yield).
   */
  replayLog: ReadonlyArray<StepRecord>
  workflow: AnyWorkflowDefinition
}

/**
 * Shared dispatch loop for start, resume-from-memory, and resume-from-
 * replay paths. Drives the generator, dispatches descriptor kinds,
 * persists step results, emits state deltas, and finalizes the run on
 * done / error / abort / pause.
 *
 * Replay phase (silent fast-forward):
 *   For the first `replayLog.length` yields, return the recorded result
 *   without dispatching or emitting client-facing events. State
 *   mutations during user code re-execute and are tracked locally so
 *   the next live-mode mutation diff is correct.
 *
 * Live phase:
 *   The next yielded descriptor is what was awaiting at pause time (for
 *   resume) or the first step (for start). The seed value, if any, is
 *   consumed exactly once as the result for that descriptor — typically
 *   an approval — and the engine appends a fresh log entry capturing
 *   it. Subsequent yields dispatch normally; each completed step is
 *   appended to the log before its STEP_FINISHED event reaches the
 *   client (at-most-once observable).
 */
async function* driveLoop(args: DriveLoopArgs): AsyncIterable<StreamChunk> {
  const {
    live,
    runId,
    state,
    runStore,
    threadId,
    outputSink,
    abortController,
    replayLog,
  } = args

  let prevState = snapshotState(state)
  // Track an outstanding approval pause that was emitted in a *prior*
  // SSE response (the run paused, the stream ended). On the in-memory
  // resume path we close that dangling STEP_STARTED by emitting a
  // matching STEP_FINISHED below; on the replay path it's already gone
  // (we built a fresh LiveRun) so this is undefined and we emit a fresh
  // pair on the consumed approval.
  const pendingApprovalStepId = live.pendingApprovalStepId
  live.pendingApprovalStepId = undefined

  // Differentiate the three entry conditions so the initial
  // generator.next() arg and the seed-consumption flag are set right:
  //
  //   start path           — generator hasn't yielded yet, no seed
  //                          → next(undefined), seedConsumed=true
  //   in-memory resume     — generator yielded the approval before the
  //                          last SSE closed; seed is the result for
  //                          *that* outstanding yield
  //                          → next(seed), seedConsumed=true
  //   replay resume        — fresh generator; replay drives it forward
  //                          step-by-step; seed gets consumed when we
  //                          reach the descriptor that has no log entry
  //                          → next(undefined), seedConsumed=false
  const isInMemoryResume = !!pendingApprovalStepId
  const hasSeed = args.seedValue !== undefined
  let nextValue: unknown = isInMemoryResume ? args.seedValue : undefined
  let seedConsumed = !hasSeed || isInMemoryResume
  let replayCursor = 0
  // Tracks the next position in the persisted log we'll append to. Starts
  // at `replayLog.length` because we never overwrite replayed entries.
  let logLength = replayLog.length
  let finalOutput: unknown = undefined

  try {
    if (pendingApprovalStepId && replayLog.length === 0) {
      // In-memory resume: the previous run handler already emitted
      // STEP_STARTED for this pause before the SSE closed; close it
      // out now. For the legacy 'approval' descriptor we marshal the
      // payload into the original {approved, feedback} envelope so
      // existing UI consumers don't break; for generic signals we
      // forward the payload as-is.
      //
      // Persist the resolved signal/approval to the log *before*
      // emitting STEP_FINISHED (Q6: at-most-once observable). This is
      // what lets a future attach call replay through the resolved
      // pause; without it, the in-memory fast-path silently skipped
      // the log append and the next replay would re-enter the pause.
      const waitingFor = live.runState.waitingFor
      const seed = args.seedValue
      const isApproval = !waitingFor || waitingFor.signalName === 'approval'
      const content = isApproval
        ? {
            approved: (seed as ApprovalResult | undefined)?.approved ?? false,
            feedback: (seed as ApprovalResult | undefined)?.feedback,
          }
        : seed
      const inMemAppend = await tryAppendStep(runStore, runId, logLength, {
        index: logLength,
        kind: isApproval ? 'approval' : 'signal',
        name: waitingFor?.signalName ?? 'approval',
        signalId: args.seedSignalId,
        result: isApproval ? seed : content,
        startedAt: Date.now(),
        finishedAt: Date.now(),
      })
      if (inMemAppend.kind === 'lost') {
        // Another delivery won the race — this caller's signal had no
        // effect. Surface so the host knows to either retry with a
        // different signalId or stand down.
        yield runErrorEvent({
          runId,
          message: `Signal lost at index ${logLength}: another delivery (signalId="${inMemAppend.existing.signalId ?? ''}") won the race.`,
          code: 'signal_lost',
        })
        return
      }
      // Idempotent: same signalId, the prior delivery's record stands.
      // We still emit STEP_FINISHED so the caller sees a coherent end.
      logLength++
      yield stepFinishedEvent({
        stepId: pendingApprovalStepId,
        stepName: waitingFor?.signalName ?? 'approval',
        content,
      })
    }

    // `pendingResult` is set by the error path: `generator.throw()`
    // already advances the generator to the next yield, so we must NOT
    // call `.next()` again in the next loop iteration. Stashing the
    // throw's return value here lets the next iteration use it directly.
    let pendingResult: IteratorResult<StepDescriptor, unknown> | null = null

    for (;;) {
      const isReplaying = replayCursor < replayLog.length

      // Drain custom events only in live mode — events emitted during
      // replay are recorded in pendingEvents but never reach the wire,
      // since the original run already emitted them.
      if (!isReplaying) {
        while (live.pendingEvents.length > 0) yield live.pendingEvents.shift()!
      } else {
        // Discard pending events accumulated during the prior generator
        // step — they were already emitted on the original run.
        live.pendingEvents.length = 0
      }

      const result =
        pendingResult ?? (await live.generator.next(nextValue as StepDescriptor))
      pendingResult = null

      // Track state diffs every iteration so the local prevState stays in
      // sync, but only emit STATE_DELTA in live mode.
      const delta = diffState(prevState, state)
      if (delta.length > 0) {
        prevState = snapshotState(state)
        if (!isReplaying) yield stateDeltaEvent({ delta })
      }

      if (result.done) {
        finalOutput = result.value
        break
      }

      const descriptor: StepDescriptor = result.value

      // Replay short-circuit: log entry exists for this position. For
      // successful records we simply hand the result back to the
      // generator. For records that captured a throw, we reconstruct
      // the Error and re-throw it into the generator so user-side
      // try/catch logic replays identically — the engine treats the
      // generator-resume in the next iteration as a thrown result via
      // `pendingResult` to avoid the double-advance bug.
      if (replayCursor < replayLog.length) {
        const record = replayLog[replayCursor]!
        replayCursor++
        if (record.error) {
          const err = new Error(record.error.message)
          err.name = record.error.name
          if (record.error.stack) err.stack = record.error.stack
          const thrown = await live.generator.throw(err)
          if (thrown.done) {
            finalOutput = thrown.value
            break
          }
          pendingResult = thrown
          continue
        }
        nextValue = record.result
        continue
      }

      const stepId = generateId('step')

      // Post-replay seed delivery: the seed value is the result for
      // the descriptor that was awaiting when the run originally
      // paused. Record it as a fresh log entry and emit synthetic
      // STEP_STARTED+STEP_FINISHED events so the consumer of this
      // resume stream sees the closure (the original STEP_STARTED was
      // emitted on the SSE response that paused, which this consumer
      // didn't necessarily see).
      if (!seedConsumed) {
        seedConsumed = true
        if (descriptor.kind === 'approval' || descriptor.kind === 'signal') {
          const sigName =
            descriptor.kind === 'approval' ? 'approval' : descriptor.name
          yield stepStartedEvent({
            stepId,
            stepName: sigName,
            stepType: descriptor.kind === 'approval' ? 'approval' : 'signal',
          })
          const outcome = await tryAppendStep(runStore, runId, logLength, {
            index: logLength,
            kind: descriptor.kind === 'approval' ? 'approval' : 'signal',
            name: sigName,
            signalId: args.seedSignalId,
            result: args.seedValue,
            startedAt: Date.now(),
            finishedAt: Date.now(),
          })
          if (outcome.kind === 'lost') {
            yield runErrorEvent({
              runId,
              message: `Signal lost at index ${logLength}: another delivery (signalId="${outcome.existing.signalId ?? ''}") won the race.`,
              code: 'signal_lost',
            })
            return
          }
          // For 'idempotent', the existing record's result becomes the
          // value sent into the generator instead of our incoming
          // seedValue — this is the retry-dedup path. Both callers
          // observe the same downstream behavior.
          const seedResult =
            outcome.kind === 'idempotent'
              ? outcome.existing.result
              : args.seedValue
          logLength++
          yield stepFinishedEvent({
            stepId,
            stepName: sigName,
            content: seedResult,
          })
          nextValue = seedResult
          continue
        }
        // Descriptor isn't a pause-kind despite us having a seed —
        // shouldn't happen. Surface as a hard error so the issue is
        // visible.
        yield runErrorEvent({
          runId,
          message: `Resume seed delivered but pending descriptor was '${descriptor.kind}', not 'approval' or 'signal'`,
          code: 'resume_mismatch',
        })
        return
      }

      // ---- agent ----
      if (descriptor.kind === 'agent') {
        const startedAt = Date.now()
        yield stepStartedEvent({
          stepId,
          stepName: descriptor.name,
          stepType: 'agent',
        })

        const { stream, output } = invokeAgent(
          descriptor.agent,
          descriptor.input,
          (name, value) => {
            live.pendingEvents.push({
              type: 'CUSTOM',
              timestamp: Date.now(),
              name,
              value,
            } as StreamChunk)
          },
          abortController.signal,
        )

        for await (const chunk of stream) yield chunk

        let stepResult: unknown
        try {
          stepResult = await output
        } catch (err) {
          // Persist the failure before reporting it. Replay will see the
          // error record and re-raise it into user code, matching the
          // original throw path.
          await appendStep(runStore, runId, logLength, {
            index: logLength,
            kind: 'agent',
            name: descriptor.name,
            error: serializeError(err),
            startedAt,
            finishedAt: Date.now(),
          })
          logLength++
          yield stepFinishedEvent({
            stepId,
            stepName: descriptor.name,
            content: { error: serializeError(err) },
          })
          nextValue = undefined
          const thrown = await live.generator.throw(err)
          if (thrown.done) {
            finalOutput = thrown.value
            break
          }
          // generator.throw already advanced to the next yield — stash
          // its result for the next iteration so we don't double-advance.
          pendingResult = thrown
          continue
        }

        await appendStep(runStore, runId, logLength, {
          index: logLength,
          kind: 'agent',
          name: descriptor.name,
          result: stepResult,
          startedAt,
          finishedAt: Date.now(),
        })
        logLength++
        yield stepFinishedEvent({
          stepId,
          stepName: descriptor.name,
          content: stepResult,
        })
        nextValue = stepResult
        continue
      }

      // ---- step (durable side-effect) ----
      if (descriptor.kind === 'step') {
        const overallStart = Date.now()
        yield stepStartedEvent({
          stepId,
          stepName: descriptor.name,
          stepType: 'step',
        })

        const ctxId = `${runId}:step-${logLength}`
        const retryPolicy =
          descriptor.retry ?? args.workflow.defaultStepRetry
        const maxAttempts = Math.max(1, retryPolicy?.maxAttempts ?? 1)
        const attempts: Array<{
          startedAt: number
          finishedAt: number
          error?: { name: string; message: string; stack?: string }
          result?: unknown
        }> = []
        let lastError: unknown
        let stepResult: unknown
        let succeeded = false

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const attemptStart = Date.now()
          try {
            stepResult = await descriptor.fn({ id: ctxId, attempt })
            attempts.push({
              startedAt: attemptStart,
              finishedAt: Date.now(),
              result: stepResult,
            })
            succeeded = true
            break
          } catch (err) {
            lastError = err
            attempts.push({
              startedAt: attemptStart,
              finishedAt: Date.now(),
              error: serializeError(err),
            })
            const shouldRetry =
              attempt < maxAttempts &&
              (retryPolicy?.shouldRetry?.(err, attempt) ?? true)
            if (!shouldRetry) break
            // In-process backoff. Durable across yields, not durable
            // across process restart — an acceptable v1 limitation
            // documented in the design doc. Long-tail retries that
            // need full durability should use `yield* sleep(...)` in
            // user code instead.
            const delayMs = computeBackoffMs(retryPolicy, attempt)
            if (delayMs > 0) {
              await new Promise<void>((resolve) => {
                const t = setTimeout(resolve, delayMs)
                // Abort cleanly if the run is cancelled mid-backoff.
                abortController.signal.addEventListener(
                  'abort',
                  () => {
                    clearTimeout(t)
                    resolve()
                  },
                  { once: true },
                )
              })
              if (abortController.signal.aborted) break
            }
          }
        }

        if (!succeeded) {
          await appendStep(runStore, runId, logLength, {
            index: logLength,
            kind: 'step',
            name: descriptor.name,
            error: serializeError(lastError),
            attempts,
            startedAt: overallStart,
            finishedAt: Date.now(),
          })
          logLength++
          yield stepFinishedEvent({
            stepId,
            stepName: descriptor.name,
            content: { error: serializeError(lastError) },
          })
          nextValue = undefined
          const thrown = await live.generator.throw(lastError)
          if (thrown.done) {
            finalOutput = thrown.value
            break
          }
          pendingResult = thrown
          continue
        }

        await appendStep(runStore, runId, logLength, {
          index: logLength,
          kind: 'step',
          name: descriptor.name,
          result: stepResult,
          attempts: attempts.length > 1 ? attempts : undefined,
          startedAt: overallStart,
          finishedAt: Date.now(),
        })
        logLength++
        yield stepFinishedEvent({
          stepId,
          stepName: descriptor.name,
          content: stepResult,
        })
        nextValue = stepResult
        continue
      }

      // ---- now / uuid (durable deterministic values) ----
      //
      // These don't emit STEP_STARTED/STEP_FINISHED — they're cheap
      // primitives whose only purpose is to capture a side-effecting
      // value once and replay it. Cluttering the WorkflowTimeline UI
      // with a "running 'now'" entry would be noise.
      if (descriptor.kind === 'now') {
        const value = Date.now()
        await appendStep(runStore, runId, logLength, {
          index: logLength,
          kind: 'now',
          name: 'now',
          result: value,
          startedAt: value,
          finishedAt: value,
        })
        logLength++
        nextValue = value
        continue
      }

      if (descriptor.kind === 'uuid') {
        // `globalThis.crypto.randomUUID()` is the cross-runtime form
        // (Node 19+, modern browsers, Deno, Bun). Fingerprint check
        // already guards against missing-API drift across deploys.
        const value = globalThis.crypto.randomUUID()
        const ts = Date.now()
        await appendStep(runStore, runId, logLength, {
          index: logLength,
          kind: 'uuid',
          name: 'uuid',
          result: value,
          startedAt: ts,
          finishedAt: ts,
        })
        logLength++
        nextValue = value
        continue
      }

      // ---- nested-workflow ----
      if (descriptor.kind === 'nested-workflow') {
        const startedAt = Date.now()
        yield stepStartedEvent({
          stepId,
          stepName: descriptor.name,
          stepType: 'nested-workflow',
        })

        let nestedOutput: unknown = undefined
        const nestedIter = runWorkflow({
          workflow: descriptor.workflow,
          input: descriptor.input,
          runStore,
          signal: abortController.signal,
          outputSink: (o) => {
            nestedOutput = o
          },
        })

        for await (const chunk of nestedIter) {
          if (chunk.type === 'RUN_STARTED' || chunk.type === 'RUN_FINISHED') {
            continue
          }
          yield chunk
        }

        await appendStep(runStore, runId, logLength, {
          index: logLength,
          kind: 'nested-workflow',
          name: descriptor.name,
          result: nestedOutput,
          startedAt,
          finishedAt: Date.now(),
        })
        logLength++
        yield stepFinishedEvent({
          stepId,
          stepName: descriptor.name,
          content: nestedOutput,
        })
        nextValue = nestedOutput
        continue
      }

      // ---- signal (generic durable pause) ----
      if (descriptor.kind === 'signal') {
        yield stepStartedEvent({
          stepId,
          stepName: descriptor.name,
          stepType: 'signal',
        })

        // Custom event for the push-discovery channel (Q5 iii): the
        // originating SSE consumer learns of the pause and can register
        // a wakeup callback in its scheduler without waiting on a store
        // poll.
        live.pendingEvents.push({
          type: 'CUSTOM',
          timestamp: Date.now(),
          name: 'run.paused',
          value: {
            runId,
            signalName: descriptor.name,
            deadline: descriptor.deadline,
            kind: descriptor.name === '__timer' ? 'sleep' : 'signal',
            meta: descriptor.meta,
          },
        } as StreamChunk)
        while (live.pendingEvents.length > 0) yield live.pendingEvents.shift()!

        live.runState = {
          ...live.runState,
          status: 'paused',
          state,
          waitingFor: {
            signalName: descriptor.name,
            deadline: descriptor.deadline,
            meta: descriptor.meta,
          },
          updatedAt: Date.now(),
        }
        // Reuse pendingApprovalStepId as the generic "I'm paused at
        // step X" marker so the in-memory resume path can close out
        // the dangling STEP_STARTED. (Naming a holdover from v1 —
        // generalizing the field name belongs to a separate refactor.)
        live.pendingApprovalStepId = stepId
        await runStore.setRunState(runId, live.runState)
        return
      }

      // ---- approval (pause) ----
      {
        const approvalDescriptor = descriptor
        const approvalId = generateId('approval')

        yield stepStartedEvent({
          stepId,
          stepName: 'approval',
          stepType: 'approval',
        })

        yield approvalRequestedEvent({
          approvalId,
          kind: 'workflow',
          title: approvalDescriptor.title,
          description: approvalDescriptor.description,
        })

        live.runState = {
          ...live.runState,
          status: 'paused',
          state,
          pendingApproval: {
            approvalId,
            title: approvalDescriptor.title,
            description: approvalDescriptor.description,
          },
          updatedAt: Date.now(),
        }
        live.pendingApprovalStepId = stepId
        await runStore.setRunState(runId, live.runState)

        // SSE stream ends; runWorkflow continues after client posts
        // approval. The approval result is appended to the log on the
        // resume side (when the seed is consumed).
        return
      }
    }

    outputSink?.(finalOutput)

    live.runState = {
      ...live.runState,
      status: 'finished',
      state,
      output: finalOutput,
      updatedAt: Date.now(),
    }
    await runStore.setRunState(runId, live.runState)
    yield runFinishedEvent({ runId, threadId, output: finalOutput })
    await runStore.deleteRun(runId, 'finished')
  } catch (err) {
    if (abortController.signal.aborted) {
      yield runErrorEvent({
        runId,
        message: 'Workflow aborted',
        code: 'aborted',
      })
      await runStore.deleteRun(runId, 'aborted')
      return
    }
    yield runErrorEvent({
      runId,
      message: errorMessage(err),
      code: 'error',
    })
    await runStore.deleteRun(runId, 'error')
  }
}

/**
 * Outcome of a `tryAppendStep` attempt under optimistic CAS.
 *
 * - `appended`  — the write went through; caller continues normally.
 * - `idempotent` — another writer already committed a record with the
 *   *same* signalId at this index. The append is treated as a no-op:
 *   the existing record is authoritative and the caller should use
 *   its `result`/`error` (typical retry scenario — same client
 *   posting twice, host webhook redelivery).
 * - `lost` — another writer committed a record with a *different*
 *   signalId. The caller's signal lost the race; the engine surfaces
 *   `RUN_ERROR { code: 'signal_lost' }` so the loser knows their
 *   delivery did not take effect.
 */
type AppendOutcome =
  | { kind: 'appended' }
  | { kind: 'idempotent'; existing: StepRecord }
  | { kind: 'lost'; existing: StepRecord }

/**
 * Append a step record under optimistic CAS, classifying conflicts.
 *
 * Non-`LogConflictError` errors from the store rethrow — those are
 * infrastructure failures, not concurrency races, and the caller's
 * try/catch in driveLoop maps them to `RUN_ERROR` via the standard
 * path.
 */
async function tryAppendStep(
  runStore: InMemoryRunStore,
  runId: string,
  expectedNextIndex: number,
  record: StepRecord,
): Promise<AppendOutcome> {
  try {
    await runStore.appendStep(runId, expectedNextIndex, record)
    return { kind: 'appended' }
  } catch (err) {
    if (err instanceof LogConflictError && err.existing) {
      const existing = err.existing
      if (record.signalId && existing.signalId === record.signalId) {
        return { kind: 'idempotent', existing }
      }
      return { kind: 'lost', existing }
    }
    throw err
  }
}

/**
 * Append-or-fail for non-signal step records (agent, nested-workflow,
 * step, now, uuid). These records have no signalId, so the CAS
 * conflict path can never reach 'idempotent' — any conflict is a
 * genuine multi-writer race, which under the v1 contract is a
 * programmer error (the engine is the only writer for its run). We
 * throw to let the driveLoop's outer try/catch surface RUN_ERROR.
 */
async function appendStep(
  runStore: InMemoryRunStore,
  runId: string,
  expectedNextIndex: number,
  record: StepRecord,
): Promise<void> {
  const outcome = await tryAppendStep(
    runStore,
    runId,
    expectedNextIndex,
    record,
  )
  if (outcome.kind !== 'appended') {
    throw new Error(
      `Log CAS conflict at index ${expectedNextIndex} on ${record.kind}/${record.name} — another writer committed first. Multi-instance writes on a single run are not supported in v1.`,
    )
  }
}
