import { bindAgents } from '../primitives/bind-agents'
import { diffState, snapshotState } from './state-diff'
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
 * Run a workflow to completion or pause point (start or resume). Returns an
 * AsyncIterable of StreamChunk that the caller pipes to SSE.
 *
 * - Start call: provide `workflow`, `input`, and `runStore`.
 * - Resume call: provide `workflow`, `runId`, `approval`, and `runStore`.
 *
 * Pause semantics: when the user code yields an `approval` descriptor, the
 * engine emits `approval-requested`, persists run state, stores the live
 * generator handle in `runStore.setLive`, then ends the stream. The client
 * resumes by calling `runWorkflow` again with `runId` and `approval`.
 */
export async function* runWorkflow(
  options: RunWorkflowOptions,
): AsyncIterable<StreamChunk> {
  if (options.runId && options.approval) {
    yield* resumeRun(options.runId, options.runStore, options.approval)
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

  const initialState = options.workflow.initialize
    ? options.workflow.initialize({ input: options.input as any })
    : {}
  const state = mergeStateDefaults(
    options.workflow,
    initialState as Record<string, unknown>,
  )

  let runState: RunState = {
    runId,
    status: 'running',
    workflowName: options.workflow.name,
    input: options.input,
    state,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await options.runStore.set(runId, runState)

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

  let prevState = snapshotState(state)
  let nextValue: unknown = undefined
  let finalOutput: unknown = undefined

  try {
    for (;;) {
      // Drain any custom events queued by emit() before advancing the generator.
      while (live.pendingEvents.length > 0) yield live.pendingEvents.shift()!

      const result = await generator.next(nextValue as StepDescriptor)

      // Diff state that may have mutated during the user's generator step.
      const delta = diffState(prevState, state)
      if (delta.length > 0) {
        yield stateDeltaEvent({ delta })
        prevState = snapshotState(state)
      }

      if (result.done) {
        finalOutput = result.value
        break
      }

      const descriptor: StepDescriptor = result.value
      const stepId = generateId('step')

      // ---- agent ----
      if (descriptor.kind === 'agent') {
        yield stepStartedEvent({
          stepId,
          stepName: descriptor.name,
          stepType: 'agent',
        })

        const { stream, output } = invokeAgent(
          descriptor.agent,
          descriptor.input,
          args.emit,
          abortController.signal,
        )

        for await (const chunk of stream) yield chunk

        let stepResult: unknown
        try {
          stepResult = await output
        } catch (err) {
          yield stepFinishedEvent({
            stepId,
            stepName: descriptor.name,
            content: { error: serializeError(err) },
          })
          nextValue = undefined
          const thrown = await generator.throw(err)
          if (thrown.done) {
            finalOutput = thrown.value
            break
          }
          continue
        }

        yield stepFinishedEvent({
          stepId,
          stepName: descriptor.name,
          content: stepResult,
        })
        nextValue = stepResult
        continue
      }

      // ---- nested-workflow ----
      if (descriptor.kind === 'nested-workflow') {
        yield stepStartedEvent({
          stepId,
          stepName: descriptor.name,
          stepType: 'nested-workflow',
        })

        let nestedOutput: unknown = undefined
        const nestedIter = runWorkflow({
          workflow: descriptor.workflow,
          input: descriptor.input,
          runStore: options.runStore,
          signal: abortController.signal,
          outputSink: (o) => {
            nestedOutput = o
          },
        })

        for await (const chunk of nestedIter) {
          // Filter inner run boundaries so the outer run owns them.
          if (chunk.type === 'RUN_STARTED' || chunk.type === 'RUN_FINISHED') {
            continue
          }
          yield chunk
        }

        yield stepFinishedEvent({
          stepId,
          stepName: descriptor.name,
          content: nestedOutput,
        })
        nextValue = nestedOutput
        continue
      }

      // ---- approval (exhaustive last branch) ----
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

        runState = {
          ...runState,
          status: 'paused',
          state,
          pendingApproval: {
            approvalId,
            title: approvalDescriptor.title,
            description: approvalDescriptor.description,
          },
          updatedAt: Date.now(),
        }
        live.runState = runState
        await options.runStore.set(runId, runState)

        // SSE stream ends here; resumeWorkflow continues after client posts approval.
        return
      }
    }

    // Notify the parent before we delete our store entry so the output is
    // accessible across the store-delete boundary.
    options.outputSink?.(finalOutput)

    runState = {
      ...runState,
      status: 'finished',
      state,
      output: finalOutput,
      updatedAt: Date.now(),
    }
    await options.runStore.set(runId, runState)
    yield runFinishedEvent({ runId, threadId: options.threadId })
    await options.runStore.delete(runId, 'finished')
  } catch (err) {
    if (abortController.signal.aborted) {
      yield runErrorEvent({
        runId,
        message: 'Workflow aborted',
        code: 'aborted',
      })
      await options.runStore.delete(runId, 'aborted')
      return
    }
    yield runErrorEvent({
      runId,
      message: errorMessage(err),
      code: 'error',
    })
    await options.runStore.delete(runId, 'error')
  }
}

async function* resumeRun(
  runId: string,
  runStore: InMemoryRunStore,
  approval: ApprovalResult,
): AsyncIterable<StreamChunk> {
  const live = runStore.getLive(runId)
  if (!live) {
    yield runErrorEvent({
      runId,
      message: `Run ${runId} not found (expired or never existed)`,
      code: 'run_lost',
    })
    return
  }

  live.runState = { ...live.runState, status: 'running', updatedAt: Date.now() }
  await runStore.set(runId, live.runState)

  yield runStartedEvent({ runId })

  const nextValue: unknown = approval
  let prevState = snapshotState(live.runState.state)
  let finalOutput: unknown = undefined

  try {
    for (;;) {
      // Drain any custom events queued by emit() before advancing the generator.
      while (live.pendingEvents.length > 0) yield live.pendingEvents.shift()!

      const result = await live.generator.next(nextValue as StepDescriptor)

      const delta = diffState(prevState, live.runState.state)
      if (delta.length > 0) {
        yield stateDeltaEvent({ delta })
        prevState = snapshotState(live.runState.state)
      }

      if (result.done) {
        finalOutput = result.value
        break
      }

      throw new Error(
        'Resume after approval supports straight-line continuation in v1; ' +
          'extract dispatch loop into a class to handle nested yields after resume.',
      )
    }

    live.runState = {
      ...live.runState,
      status: 'finished',
      output: finalOutput,
      updatedAt: Date.now(),
    }
    await runStore.set(runId, live.runState)
    yield runFinishedEvent({ runId })
    await runStore.delete(runId, 'finished')
  } catch (err) {
    yield runErrorEvent({
      runId,
      message: errorMessage(err),
      code: 'error',
    })
    await runStore.delete(runId, 'error')
  }
}
