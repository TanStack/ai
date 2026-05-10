import type { StreamChunk } from '@tanstack/ai'
import type { Operation } from './state-diff'

/**
 * Helpers that produce native AG-UI event chunks for the workflow lifecycle.
 * The engine yields these into the outer SSE stream.
 */

export function runStartedEvent(args: {
  runId: string
  threadId?: string
}): StreamChunk {
  return {
    type: 'RUN_STARTED',
    timestamp: Date.now(),
    runId: args.runId,
    threadId: args.threadId ?? args.runId,
  } as StreamChunk
}

export function runFinishedEvent(args: {
  runId: string
  threadId?: string
}): StreamChunk {
  return {
    type: 'RUN_FINISHED',
    timestamp: Date.now(),
    runId: args.runId,
    threadId: args.threadId ?? args.runId,
  } as StreamChunk
}

export function runErrorEvent(args: {
  runId: string
  message: string
  code?: string
}): StreamChunk {
  return {
    type: 'RUN_ERROR',
    timestamp: Date.now(),
    runId: args.runId,
    message: args.message,
    code: args.code ?? 'error',
  } as StreamChunk
}

export function stepStartedEvent(args: {
  stepId: string
  stepName: string
  stepType?: 'agent' | 'approval' | 'nested-workflow'
}): StreamChunk {
  return {
    type: 'STEP_STARTED',
    timestamp: Date.now(),
    stepName: args.stepName,
    stepId: args.stepId,
    stepType: args.stepType,
  } as StreamChunk
}

export function stepFinishedEvent(args: {
  stepId: string
  stepName: string
  content?: unknown
}): StreamChunk {
  return {
    type: 'STEP_FINISHED',
    timestamp: Date.now(),
    stepName: args.stepName,
    stepId: args.stepId,
    content: args.content,
  } as StreamChunk
}

export function stateSnapshotEvent(args: { snapshot: unknown }): StreamChunk {
  return {
    type: 'STATE_SNAPSHOT',
    timestamp: Date.now(),
    snapshot: args.snapshot,
  } as StreamChunk
}

export function stateDeltaEvent(args: { delta: Array<Operation> }): StreamChunk {
  return {
    type: 'STATE_DELTA',
    timestamp: Date.now(),
    delta: args.delta,
  } as StreamChunk
}

export function customEvent(args: {
  name: string
  value: Record<string, unknown>
}): StreamChunk {
  return {
    type: 'CUSTOM',
    timestamp: Date.now(),
    name: args.name,
    value: args.value,
  } as StreamChunk
}

export function approvalRequestedEvent(args: {
  approvalId: string
  kind: 'workflow' | 'tool'
  title: string
  description?: string
}): StreamChunk {
  return customEvent({
    name: 'approval-requested',
    value: {
      approvalId: args.approvalId,
      kind: args.kind,
      title: args.title,
      description: args.description,
    },
  })
}
