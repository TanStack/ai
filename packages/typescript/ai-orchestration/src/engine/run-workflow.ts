import { bindAgents } from '../primitives/bind-agents'
import { diffState, snapshotState } from './state-diff'
import { fingerprintWorkflow } from './fingerprint'
import {
  approvalRequestedEvent,
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
  StepDescriptor,
  StepRecord,
  WorkflowRunArgs,
} from '../types'
import type { InMemoryRunStore } from '../run-store/in-memory'

export interface RunWorkflowOptions {
  workflow: AnyWorkflowDefinition
  runStore: InMemoryRunStore
  /** First-call: provide `input`. Resume-call: provide `runId` + `approval`. */
  input?: unknown
  runId?: string
  approval?: ApprovalResult
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
  if (options.runId && options.approval) {
    yield* resumeRun(options)
    return
  }
  if (options.input === undefined) {
    throw new Error(
      'runWorkflow: either `input` or both `runId` and `approval` must be provided',
    )
  }
  yield* startRun(options as RunWorkflowOptions & { input: unknown })
}

async function* startRun(
  options: RunWorkflowOptions & { input: unknown },
): AsyncIterable<StreamChunk> {
  const runId = options.runId ?? generateId('run')
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
    fingerprint: fingerprintWorkflow(options.workflow),
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

async function* resumeRun(
  options: RunWorkflowOptions,
): AsyncIterable<StreamChunk> {
  const runId = options.runId!
  const approval = options.approval!

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
      seedValue: approval,
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
    seedValue: approval,
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
      // STEP_STARTED for this approval before the SSE closed; close it
      // out now with the actual approval payload.
      const approvalResult = args.seedValue as ApprovalResult | undefined
      yield stepFinishedEvent({
        stepId: pendingApprovalStepId,
        stepName: 'approval',
        content: {
          approved: approvalResult?.approved ?? false,
          feedback: approvalResult?.feedback,
        },
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

      // Post-replay seed delivery: the seed value (typically an approval
      // payload) is the result for the descriptor that was awaiting when
      // the run originally paused. Record it as a fresh log entry and
      // emit a synthetic STEP_STARTED+STEP_FINISHED pair so the consumer
      // of this resume stream sees the approval closure (the original
      // STEP_STARTED was emitted on the SSE response that paused, which
      // this consumer didn't necessarily see).
      if (!seedConsumed) {
        seedConsumed = true
        if (descriptor.kind === 'approval') {
          yield stepStartedEvent({
            stepId,
            stepName: 'approval',
            stepType: 'approval',
          })
          await appendStep(runStore, runId, logLength, {
            index: logLength,
            kind: 'approval',
            name: 'approval',
            result: args.seedValue,
            startedAt: Date.now(),
            finishedAt: Date.now(),
          })
          logLength++
          yield stepFinishedEvent({
            stepId,
            stepName: 'approval',
            content: args.seedValue,
          })
          nextValue = args.seedValue
          continue
        }
        // Descriptor isn't an approval despite us having a seed —
        // shouldn't happen with the v1 contract (resume implies
        // approval). Surface as a hard error so the issue is visible.
        yield runErrorEvent({
          runId,
          message: `Resume seed delivered but pending descriptor was '${descriptor.kind}', not 'approval'`,
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
        const startedAt = Date.now()
        yield stepStartedEvent({
          stepId,
          stepName: descriptor.name,
          stepType: 'step',
        })

        const ctxId = `${runId}:step-${logLength}`
        let stepResult: unknown
        try {
          stepResult = await descriptor.fn({ id: ctxId })
        } catch (err) {
          await appendStep(runStore, runId, logLength, {
            index: logLength,
            kind: 'step',
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
          kind: 'step',
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
 * Append a step record. If the store throws `LogConflictError`, we
 * surface a `RUN_ERROR` because true CAS conflicts can only happen when
 * another writer raced us — and v1 doesn't have signal-delivery races
 * yet (those land in step 5). For now any conflict is a logic bug, not
 * a recoverable race.
 */
async function appendStep(
  runStore: InMemoryRunStore,
  runId: string,
  expectedNextIndex: number,
  record: StepRecord,
): Promise<void> {
  await runStore.appendStep(runId, expectedNextIndex, record)
}
