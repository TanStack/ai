import type {
  Interrupt,
  InterruptRecoveryStateV1,
  RunAgentResumeItem,
} from '@tanstack/ai/client'

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isInterruptDescriptor(value: unknown): value is Interrupt {
  if (!isUnknownRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.reason !== 'string') {
    return false
  }
  if (value.message !== undefined && typeof value.message !== 'string') {
    return false
  }
  if (value.toolCallId !== undefined && typeof value.toolCallId !== 'string') {
    return false
  }
  if (
    value.responseSchema !== undefined &&
    !isUnknownRecord(value.responseSchema)
  ) {
    return false
  }
  if (value.expiresAt !== undefined && typeof value.expiresAt !== 'string') {
    return false
  }
  return value.metadata === undefined || isUnknownRecord(value.metadata)
}

function isResumeEntry(value: unknown): value is RunAgentResumeItem {
  return (
    isUnknownRecord(value) &&
    typeof value.interruptId === 'string' &&
    (value.status === 'resolved' || value.status === 'cancelled')
  )
}

function isInterruptRecoveryStateName(
  value: unknown,
): value is InterruptRecoveryStateV1['state'] {
  return (
    typeof value === 'string' &&
    ['pending', 'committed', 'expired', 'missing', 'legacy-committed'].includes(
      value,
    )
  )
}

/** @internal Runtime boundary parser for interrupt recovery state. */
export function parseInterruptRecoveryState(
  value: unknown,
): InterruptRecoveryStateV1 {
  if (
    !isUnknownRecord(value) ||
    value.schemaVersion !== 1 ||
    !isInterruptRecoveryStateName(value.state) ||
    typeof value.threadId !== 'string' ||
    value.threadId.length === 0 ||
    typeof value.interruptedRunId !== 'string' ||
    value.interruptedRunId.length === 0 ||
    typeof value.generation !== 'number' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    !Array.isArray(value.pendingInterrupts) ||
    !value.pendingInterrupts.every(isInterruptDescriptor)
  ) {
    throw new TypeError('Invalid interrupt recovery response.')
  }
  let committed: InterruptRecoveryStateV1['committed']
  if (value.committed !== undefined) {
    if (
      !isUnknownRecord(value.committed) ||
      typeof value.committed.fingerprint !== 'string' ||
      typeof value.committed.committedAt !== 'string' ||
      (value.committed.continuationRunId !== undefined &&
        typeof value.committed.continuationRunId !== 'string') ||
      (value.committed.resolutions !== undefined &&
        (!Array.isArray(value.committed.resolutions) ||
          !value.committed.resolutions.every(isResumeEntry)))
    ) {
      throw new TypeError('Invalid interrupt recovery response.')
    }
    committed = {
      fingerprint: value.committed.fingerprint,
      committedAt: value.committed.committedAt,
      ...(value.committed.continuationRunId === undefined
        ? {}
        : { continuationRunId: value.committed.continuationRunId }),
      ...(value.committed.resolutions === undefined
        ? {}
        : { resolutions: value.committed.resolutions }),
    }
  }
  return {
    schemaVersion: 1,
    state: value.state,
    threadId: value.threadId,
    interruptedRunId: value.interruptedRunId,
    generation: value.generation,
    pendingInterrupts: value.pendingInterrupts,
    ...(typeof value.submissionId === 'string'
      ? { submissionId: value.submissionId }
      : {}),
    ...(typeof value.continuationRunId === 'string'
      ? { continuationRunId: value.continuationRunId }
      : {}),
    ...(committed === undefined ? {} : { committed }),
  }
}
