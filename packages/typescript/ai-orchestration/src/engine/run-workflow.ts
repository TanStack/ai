import {
  StepTimeoutError,
  createWorkflow as createCoreWorkflow,
  runWorkflow as runCoreWorkflow,
} from '@tanstack/workflow-core'
import { bindAgents } from '../primitives/bind-agents'
import { workflowEventsToStepRecords } from '../run-store/compat-events'
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
  Ctx as CoreCtx,
  RunStore as CoreRunStore,
  SignalDelivery as CoreSignalDelivery,
  AnyWorkflowDefinition as CoreWorkflowDefinition,
  WorkflowEvent as CoreWorkflowEvent,
} from '@tanstack/workflow-core'
import type {
  AnyWorkflowDefinition,
  ApprovalResult,
  SignalResult,
  StepDescriptor,
} from '../types'

const STREAM_CHUNK_EVENT = 'tanstack-ai.stream-chunk'

export interface RunWorkflowOptions {
  workflow: AnyWorkflowDefinition
  runStore: CoreRunStore
  input?: unknown
  runId?: string
  approval?: ApprovalResult
  signalDelivery?: SignalResult
  attach?: boolean
  signal?: AbortSignal
  threadId?: string
  outputSink?: (output: unknown) => void
  publish?: (runId: string, event: StreamChunk) => void | Promise<void>
}

interface CoreRuntime {
  patchNames?: ReadonlyArray<string>
  publish?: (runId: string, event: StreamChunk) => void | Promise<void>
  runStore: CoreRunStore
  threadId?: string
}

interface AttachEnvelope {
  stateSnapshot: Record<string, unknown>
  steps: unknown
}

type CoreStepKind = 'agent' | 'nested-workflow' | 'patched' | 'step'
type StepIdFactory = (stepType: CoreStepKind, name: string) => string

/**
 * Drive an AI orchestration workflow through @tanstack/workflow-core.
 *
 * The AI package owns only the AI-specific layer:
 * - `defineAgent` execution and streamed agent chunks
 * - generator ergonomics (`yield* agents.writer(...)`)
 * - conversion from workflow-core events to TanStack AI StreamChunks
 *
 * Durable workflow behavior (steps, replay, approvals, signals, retries,
 * run stores, request parsing) is delegated to workflow-core.
 */
export async function* runWorkflow(
  options: RunWorkflowOptions,
): AsyncIterable<StreamChunk> {
  const attachEnvelope = await buildAttachEnvelope(options)
  const workflow = toCoreWorkflow(options.workflow, {
    publish: options.publish,
    runStore: options.runStore,
    threadId: options.threadId,
  })

  const signalDelivery = await normalizeSignalDelivery(options)
  const mapForPublish = createCoreEventMapper(options, attachEnvelope)
  const mapForYield = createCoreEventMapper(options, attachEnvelope)
  const coreEvents = runCoreWorkflow({
    workflow,
    runStore: options.runStore,
    input: options.input,
    runId: options.runId,
    approval: options.approval,
    signalDelivery,
    attach: options.attach,
    signal: options.signal,
    threadId: options.threadId,
    outputSink: options.outputSink,
    publish: async (runId, event) => {
      if (!options.publish) return
      for (const chunk of mapForPublish(event, runId)) {
        await options.publish(runId, chunk)
      }
    },
  })

  let currentRunId = options.runId
  for await (const event of coreEvents) {
    if (event.type === 'RUN_STARTED') currentRunId = event.runId
    for (const chunk of mapForYield(event, currentRunId)) {
      yield chunk
    }
  }
}

function toCoreWorkflow(
  workflow: AnyWorkflowDefinition,
  runtime: CoreRuntime,
): CoreWorkflowDefinition {
  return createCoreWorkflow({
    id: workflow.name,
    description: workflow.description,
    version: workflow.version,
    input: workflow.inputSchema,
    output: workflow.outputSchema,
    state: workflow.stateSchema,
    initialize: workflow.initialize,
    defaultStepRetry: workflow.defaultStepRetry,
  }).handler(async (ctx) => {
    const generator = workflow.run({
      input: ctx.input,
      state: ctx.state,
      agents: bindAgents(workflow.agents),
      emit: ctx.emit,
      signal: ctx.signal,
    })

    return driveGenerator(generator, ctx, {
      ...runtime,
      patchNames: workflow.patches ?? [],
    })
  }) as CoreWorkflowDefinition
}

async function driveGenerator(
  generator: AsyncGenerator<StepDescriptor, unknown, unknown>,
  ctx: CoreCtx<unknown, any>,
  runtime: CoreRuntime,
): Promise<unknown> {
  const nextStepId = createStepIdFactory()
  let nextValue: unknown
  let result = await generator.next()

  while (!result.done) {
    try {
      nextValue = await executeDescriptor(
        result.value,
        ctx,
        runtime,
        nextStepId,
      )
      result = await generator.next(nextValue)
    } catch (err) {
      result = await generator.throw(err)
    }
  }

  return result.value
}

async function executeDescriptor(
  descriptor: StepDescriptor,
  ctx: CoreCtx<unknown, any>,
  runtime: CoreRuntime,
  nextStepId: StepIdFactory,
): Promise<unknown> {
  switch (descriptor.kind) {
    case 'agent':
      return executeAgentDescriptor(
        descriptor,
        ctx,
        nextStepId('agent', descriptor.name),
      )
    case 'nested-workflow':
      return executeNestedWorkflowDescriptor(
        descriptor,
        ctx,
        runtime,
        nextStepId('nested-workflow', descriptor.name),
      )
    case 'approval':
      return ctx.approve({
        title: descriptor.title,
        description: descriptor.description,
      })
    case 'step': {
      const stepId = nextStepId('step', descriptor.name)
      try {
        return await ctx.step(stepId, descriptor.fn, {
          retry: descriptor.retry,
          timeout: descriptor.timeout,
        })
      } catch (err) {
        throw normalizeStepError(err, stepId, descriptor.timeout)
      }
    }
    case 'signal':
      return ctx.waitForEvent(descriptor.name, {
        deadline: descriptor.deadline,
        meta: descriptor.meta,
      })
    case 'now':
      return ctx.now()
    case 'uuid':
      return ctx.uuid()
    case 'patched':
      return ctx.step(nextStepId('patched', descriptor.name), () =>
        Boolean(runtime.patchNames?.includes(descriptor.name)),
      )
  }
}

async function buildAttachEnvelope(
  options: RunWorkflowOptions,
): Promise<AttachEnvelope | undefined> {
  if (!options.runId || options.signalDelivery || options.approval) {
    return undefined
  }

  const runState = await options.runStore.getRunState(options.runId)
  if (!runState) return undefined
  if (!options.attach && options.input === undefined) return undefined

  const events = await options.runStore.getEvents(options.runId)
  return {
    stateSnapshot: buildInitialStateSnapshot(options.workflow, runState.input),
    steps: workflowEventsToStepRecords(events),
  }
}

function executeAgentDescriptor(
  descriptor: Extract<StepDescriptor, { kind: 'agent' }>,
  ctx: CoreCtx<unknown, Record<string, unknown>>,
  stepId: string,
): Promise<unknown> {
  return ctx.step(stepId, async () => {
    const { stream, output } = invokeAgent(
      descriptor.agent,
      descriptor.input,
      ctx.emit,
      ctx.signal,
    )

    for await (const chunk of stream) {
      ctx.emit(STREAM_CHUNK_EVENT, { chunk })
    }

    return output
  })
}

async function executeNestedWorkflowDescriptor(
  descriptor: Extract<StepDescriptor, { kind: 'nested-workflow' }>,
  ctx: CoreCtx<unknown, Record<string, unknown>>,
  runtime: CoreRuntime,
  stepId: string,
): Promise<unknown> {
  return ctx.step(stepId, async () => {
    let output: unknown
    const stream = runWorkflow({
      workflow: descriptor.workflow,
      input: descriptor.input,
      runStore: runtime.runStore,
      signal: ctx.signal,
      threadId: runtime.threadId,
      publish: runtime.publish,
      outputSink: (value) => {
        output = value
      },
    })

    for await (const chunk of stream) {
      if (chunk.type === 'RUN_STARTED' || chunk.type === 'RUN_FINISHED') {
        continue
      }
      ctx.emit(STREAM_CHUNK_EVENT, { chunk })
    }

    return output
  })
}

async function normalizeSignalDelivery(
  options: RunWorkflowOptions,
): Promise<CoreSignalDelivery | undefined> {
  if (!options.signalDelivery) return undefined
  if (options.signalDelivery.name) {
    return {
      signalId: options.signalDelivery.signalId,
      name: options.signalDelivery.name,
      payload: options.signalDelivery.payload,
    }
  }
  if (!options.runId) return undefined

  const runState = await options.runStore.getRunState(options.runId)
  const name = runState?.waitingFor?.signalName
  if (!name) return undefined

  return {
    signalId: options.signalDelivery.signalId,
    name,
    payload: options.signalDelivery.payload,
  }
}

function mapCoreEventToChunks(
  event: CoreWorkflowEvent,
  options: RunWorkflowOptions,
  runId?: string,
  stateSnapshot?: Record<string, unknown>,
): Array<StreamChunk> {
  switch (event.type) {
    case 'RUN_STARTED':
      return [
        runStartedEvent({ runId: event.runId, threadId: options.threadId }),
        stateSnapshotEvent({
          snapshot:
            stateSnapshot ??
            (options.input === undefined
              ? {}
              : buildInitialStateSnapshot(options.workflow, options.input)),
        }),
      ]
    case 'RUN_FINISHED':
      return [
        runFinishedEvent({
          runId: event.runId,
          threadId: options.threadId,
          output: event.output,
        }),
      ]
    case 'RUN_ERRORED':
      return [
        runErrorEvent({
          runId: event.runId,
          threadId: options.threadId,
          message: event.error.message,
          code: event.code,
        }),
      ]
    case 'STEP_STARTED': {
      const details = parseStepId(event.stepId)
      return [
        stepStartedEvent({
          stepId: event.stepId,
          stepName: details.name,
          stepType: details.stepType,
        }),
      ]
    }
    case 'STEP_FINISHED': {
      const details = parseStepId(event.stepId)
      return [
        stepFinishedEvent({
          stepId: event.stepId,
          stepName: details.name,
          content: event.result,
        }),
      ]
    }
    case 'STEP_FAILED': {
      const details = parseStepId(event.stepId)
      return [
        stepFinishedEvent({
          stepId: event.stepId,
          stepName: details.name,
          content: { error: event.error },
        }),
      ]
    }
    case 'APPROVAL_REQUESTED': {
      const stepId = makeApprovalStepId(event.approvalId)
      return [
        stepStartedEvent({
          stepId,
          stepName: 'approval',
          stepType: 'approval',
        }),
        approvalRequestedEvent({
          approvalId: event.approvalId,
          kind: 'workflow',
          title: event.title,
          description: event.description,
        }),
        customEvent({
          name: 'run.paused',
          value: {
            runId,
            signalName: '__approval',
            kind: 'approval',
            approvalId: event.approvalId,
            title: event.title,
            description: event.description,
          },
        }),
      ]
    }
    case 'APPROVAL_RESOLVED':
      return [
        stepFinishedEvent({
          stepId: makeApprovalStepId(event.approvalId),
          stepName: 'approval',
          content: {
            approved: event.approved,
            approvalId: event.approvalId,
            feedback: event.feedback,
          },
        }),
      ]
    case 'SIGNAL_AWAITED': {
      const stepId = makeSignalStepId(event.name)
      return [
        stepStartedEvent({
          stepId,
          stepName: event.name,
          stepType: 'signal',
        }),
        customEvent({
          name: 'run.paused',
          value: {
            runId,
            signalName: event.name,
            deadline: event.deadline,
            kind: event.name === '__timer' ? 'sleep' : 'signal',
            meta: event.meta,
          },
        }),
      ]
    }
    case 'SIGNAL_RESOLVED':
      return [
        stepFinishedEvent({
          stepId: makeSignalStepId(event.name),
          stepName: event.name,
          content: event.payload,
        }),
      ]
    case 'STATE_DELTA':
      return [stateDeltaEvent({ delta: [...event.delta] })]
    case 'CUSTOM':
      return mapCustomEvent(event)
    case 'NOW_RECORDED':
    case 'UUID_RECORDED':
      return []
  }
}

function createCoreEventMapper(
  options: RunWorkflowOptions,
  attachEnvelope?: AttachEnvelope,
): (event: CoreWorkflowEvent, runId?: string) => Array<StreamChunk> {
  let emittedAttachEnvelope = false

  return (event, runId) => {
    const chunks = mapCoreEventToChunks(
      event,
      options,
      runId,
      attachEnvelope?.stateSnapshot,
    )

    if (
      event.type === 'RUN_STARTED' &&
      attachEnvelope &&
      !emittedAttachEnvelope
    ) {
      emittedAttachEnvelope = true
      chunks.push(
        customEvent({
          name: 'steps-snapshot',
          value: { steps: attachEnvelope.steps },
        }),
      )
    }

    return chunks
  }
}

function normalizeStepError(
  err: unknown,
  stepId: string,
  timeoutMs?: number,
): unknown {
  if (err instanceof StepTimeoutError) return err
  if (
    timeoutMs !== undefined &&
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    err.name === 'StepTimeoutError'
  ) {
    return new StepTimeoutError(stepId, timeoutMs)
  }

  return err
}

function mapCustomEvent(
  event: Extract<CoreWorkflowEvent, { type: 'CUSTOM' }>,
): Array<StreamChunk> {
  if (event.name === STREAM_CHUNK_EVENT) {
    const chunk = event.value.chunk
    if (isStreamChunk(chunk)) return [chunk]
    return []
  }

  return [customEvent({ name: event.name, value: event.value })]
}

function createStepIdFactory(): StepIdFactory {
  const counts = new Map<string, number>()

  return (stepType, name) => {
    const key = `${stepType}:${name}`
    const occurrence = counts.get(key) ?? 0
    counts.set(key, occurrence + 1)
    return makeStepId(stepType, name, occurrence)
  }
}

function makeStepId(
  stepType: CoreStepKind,
  name: string,
  occurrence = 0,
): string {
  const encodedName = encodeURIComponent(name)
  return occurrence === 0
    ? `${stepType}:${encodedName}`
    : `${stepType}:${encodedName}#${occurrence}`
}

function makeApprovalStepId(approvalId: string): string {
  return `approval:${approvalId}`
}

function makeSignalStepId(name: string): string {
  return `signal:${name}`
}

function parseStepId(stepId: string): {
  name: string
  stepType: 'agent' | 'nested-workflow' | 'step' | undefined
} {
  const separator = stepId.indexOf(':')
  if (separator === -1) return { name: stepId, stepType: undefined }

  const prefix = stepId.slice(0, separator)
  const rest = stepId.slice(separator + 1)
  if (
    prefix === 'agent' ||
    prefix === 'nested-workflow' ||
    prefix === 'patched' ||
    prefix === 'step'
  ) {
    return {
      name: parseStepName(rest),
      stepType: prefix === 'patched' ? undefined : prefix,
    }
  }

  return { name: stepId, stepType: undefined }
}

function parseStepName(rest: string): string {
  const encodedName = rest.replace(/#\d+$/, '')

  try {
    return decodeURIComponent(encodedName)
  } catch {
    return encodedName
  }
}

function isStreamChunk(value: unknown): value is StreamChunk {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

function buildInitialStateSnapshot(
  workflow: AnyWorkflowDefinition,
  input: unknown,
): Record<string, unknown> {
  const initial = workflow.initialize
    ? workflow.initialize({ input: input })
    : {}
  const withPatches = {
    ...initial,
    __tanstackAiPatches: workflow.patches ? [...workflow.patches] : undefined,
  }

  if (!workflow.stateSchema) return withoutInternalState(withPatches)

  const validated = workflow.stateSchema['~standard'].validate(initial)
  if (validated instanceof Promise || validated.issues) {
    return withoutInternalState(withPatches)
  }

  return withoutInternalState(validated.value as Record<string, unknown>)
}

function withoutInternalState(
  state: Record<string, unknown>,
): Record<string, unknown> {
  const { __tanstackAiPatches: _patches, ...publicState } = state
  return publicState
}
