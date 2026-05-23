import type { WorkflowEvent } from '@tanstack/workflow-core'
import type { StepRecord } from '../types'

export function workflowEventsToStepRecords(
  events: ReadonlyArray<WorkflowEvent>,
): ReadonlyArray<StepRecord> {
  return events
    .map(workflowEventToStepRecord)
    .filter((record): record is StepRecord => record !== undefined)
    .map((record, index) => ({ ...record, index }))
}

export function workflowEventToStepRecord(
  event: WorkflowEvent,
): StepRecord | undefined {
  switch (event.type) {
    case 'STEP_FINISHED': {
      const details = parseStepId(event.stepId)
      return {
        index: 0,
        kind: details.kind,
        name: details.name,
        result: event.result,
        startedAt: event.ts,
        finishedAt: event.ts,
        attempts: event.attempts,
      }
    }
    case 'STEP_FAILED': {
      const details = parseStepId(event.stepId)
      return {
        index: 0,
        kind: details.kind,
        name: details.name,
        error: event.error,
        startedAt: event.ts,
        finishedAt: event.ts,
        attempts: event.attempts,
      }
    }
    case 'APPROVAL_RESOLVED':
      return {
        index: 0,
        kind: 'approval',
        name: 'approval',
        signalId: event.approvalId,
        result: {
          approved: event.approved,
          approvalId: event.approvalId,
          feedback: event.feedback,
        },
        startedAt: event.ts,
        finishedAt: event.ts,
      }
    case 'SIGNAL_RESOLVED':
      return {
        index: 0,
        kind: event.name === '__timer' ? 'sleep' : 'signal',
        name: event.name,
        signalId: event.signalId,
        result: event.payload,
        startedAt: event.ts,
        finishedAt: event.ts,
      }
    case 'NOW_RECORDED':
      return {
        index: 0,
        kind: 'now',
        name: 'now',
        result: event.value,
        startedAt: event.ts,
        finishedAt: event.ts,
      }
    case 'UUID_RECORDED':
      return {
        index: 0,
        kind: 'uuid',
        name: 'uuid',
        result: event.value,
        startedAt: event.ts,
        finishedAt: event.ts,
      }
    default:
      return undefined
  }
}

export function stepRecordToWorkflowEvent(record: StepRecord): WorkflowEvent {
  const ts = record.finishedAt ?? record.startedAt

  if (record.kind === 'approval') {
    const result = readApprovalResult(record.result)
    return {
      type: 'APPROVAL_RESOLVED',
      ts,
      stepId: '__resolve-approval',
      approvalId: result.approvalId ?? record.signalId ?? record.name,
      approved: result.approved ?? false,
      feedback: result.feedback,
    }
  }

  if (record.kind === 'signal' || record.kind === 'sleep') {
    return {
      type: 'SIGNAL_RESOLVED',
      ts,
      stepId: `__resolve-${record.name}`,
      name: record.name,
      signalId: record.signalId,
      payload: record.result,
    }
  }

  if (record.kind === 'now') {
    return {
      type: 'NOW_RECORDED',
      ts,
      stepId: `__now-${record.index}`,
      value: Number(record.result),
    }
  }

  if (record.kind === 'uuid') {
    return {
      type: 'UUID_RECORDED',
      ts,
      stepId: `__uuid-${record.index}`,
      value: String(record.result),
    }
  }

  if (record.error) {
    return {
      type: 'STEP_FAILED',
      ts,
      stepId: `${record.kind}:${record.name}`,
      error: record.error,
      attempts: record.attempts,
    }
  }

  return {
    type: 'STEP_FINISHED',
    ts,
    stepId: `${record.kind}:${record.name}`,
    result: record.result,
    attempts: record.attempts,
  }
}

function parseStepId(stepId: string): {
  kind: StepRecord['kind']
  name: string
} {
  const separator = stepId.indexOf(':')
  if (separator === -1) return { kind: 'step', name: stepId }

  const prefix = stepId.slice(0, separator)
  const name = stepId.slice(separator + 1)

  if (
    prefix === 'agent' ||
    prefix === 'nested-workflow' ||
    prefix === 'patched' ||
    prefix === 'step'
  ) {
    return { kind: prefix, name }
  }

  return { kind: 'step', name }
}

function readApprovalResult(value: unknown): {
  approved?: boolean
  approvalId?: string
  feedback?: string
} {
  if (typeof value !== 'object' || value === null) return {}
  return value
}
