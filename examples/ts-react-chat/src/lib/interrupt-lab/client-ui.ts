import { interruptLabScenarios } from './scenarios'
import type { InterruptLabMode, InterruptLabScenarioId } from './scenarios'

export type DurableControl =
  | 'saved-drafts'
  | 'reload-recovery'
  | 'retry-join-replay'
  | 'cas-conflict'
  | 'expiry'

export interface InterruptLabPageConfig {
  endpoint: '/api/interrupts' | '/api/durable-interrupts'
  threadPrefix: 'interrupt-lab-ephemeral' | 'interrupt-lab-durable'
  durable: boolean
  promptFor: (scenarioId: InterruptLabScenarioId) => string
}

export interface InterruptErrorLike {
  code: string
  message: string
}

export interface InterruptEditorDraft {
  editedArgs: string
  includeEditedArgs: boolean
  approvePayload: string
  rejectPayload: string
  output: string
}

export interface DurableDraftEnvelope {
  schemaVersion: 1
  mode: 'durable'
  threadId: string
  interruptedRunId: string
  drafts: Record<string, InterruptEditorDraft>
}

export type DurableOutcomeKind =
  | 'protected'
  | 'retryable'
  | 'conflict'
  | 'stale'
  | 'expired'
  | 'recovery-unavailable'

export interface DurableCapabilityStatus {
  id: DurableControl | 'retry' | 'join-replay'
  availability: 'available' | 'unavailable' | 'observable-only'
  detail: string
}

function parseOptionalJson(source: string): unknown | undefined {
  const trimmed = source.trim()
  return trimmed === '' ? undefined : JSON.parse(trimmed)
}

export function interruptLabPageConfig(
  mode: InterruptLabMode,
): InterruptLabPageConfig {
  return {
    endpoint:
      mode === 'durable' ? '/api/durable-interrupts' : '/api/interrupts',
    threadPrefix:
      mode === 'durable' ? 'interrupt-lab-durable' : 'interrupt-lab-ephemeral',
    durable: mode === 'durable',
    promptFor: (scenarioId) => interruptLabScenarios[scenarioId].prompt,
  }
}

export function buildApprovalResolution(
  approved: boolean,
  editedArgsSource: string,
  payloadSource: string,
): {
  approved: boolean
  options?: { editedArgs?: unknown; payload?: unknown }
} {
  const editedArgs = approved ? parseOptionalJson(editedArgsSource) : undefined
  const payload = parseOptionalJson(payloadSource)
  if (editedArgs === undefined && payload === undefined) return { approved }
  return {
    approved,
    options: {
      ...(editedArgs !== undefined ? { editedArgs } : {}),
      ...(payload !== undefined ? { payload } : {}),
    },
  }
}

export function buildGenericResolution(source: string): unknown {
  return JSON.parse(source)
}

export function invalidAggregateResolutionArguments(
  kind: 'tool-approval' | 'generic' | 'client-tool-execution',
): Array<unknown> {
  return kind === 'tool-approval'
    ? [true, { editedArgs: {}, payload: {} }]
    : [{}]
}

export function createIncompleteBulkResolver(): (interrupt: {
  id: string
}) => undefined {
  return () => undefined
}

export function interruptProgressLabel(
  total: number,
  staged: number,
  resuming: boolean,
): string {
  if (resuming) return `Submitting ${total} interrupt decisions…`
  const remaining = total - staged
  if (remaining === 1 && total > 1) {
    return `${staged} of ${total} staged · the final decision auto-submits the batch`
  }
  return `${staged} of ${total} staged · ${remaining} remaining`
}

export function isNormalSendDisabled(
  message: string,
  isLoading: boolean,
  resuming: boolean,
  interruptCount: number,
): boolean {
  return message.trim() === '' || isLoading || resuming || interruptCount > 0
}

export function visibleDurableControls(
  mode: InterruptLabMode,
): ReadonlyArray<DurableControl> {
  return mode === 'durable'
    ? [
        'saved-drafts',
        'reload-recovery',
        'retry-join-replay',
        'cas-conflict',
        'expiry',
      ]
    : []
}

export function describeInterruptErrors(
  itemErrors: ReadonlyArray<InterruptErrorLike>,
  batchErrors: ReadonlyArray<InterruptErrorLike>,
): Array<string> {
  return [
    ...itemErrors.map((error) => `Item · ${error.code} · ${error.message}`),
    ...batchErrors.map((error) => `Batch · ${error.code} · ${error.message}`),
  ]
}

export function createDurableDraftEnvelope({
  mode,
  threadId,
  interruptedRunId,
  drafts,
}: {
  mode: InterruptLabMode
  threadId: string
  interruptedRunId: string
  drafts: Record<string, InterruptEditorDraft>
}): DurableDraftEnvelope | undefined {
  if (mode !== 'durable') return undefined
  return {
    schemaVersion: 1,
    mode,
    threadId,
    interruptedRunId,
    drafts,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isInterruptEditorDraft(value: unknown): value is InterruptEditorDraft {
  return (
    isRecord(value) &&
    typeof value.editedArgs === 'string' &&
    typeof value.includeEditedArgs === 'boolean' &&
    typeof value.approvePayload === 'string' &&
    typeof value.rejectPayload === 'string' &&
    typeof value.output === 'string'
  )
}

export function restoreDurableDrafts({
  mode,
  threadId,
  interruptedRunId,
  activeInterruptIds,
  serialized,
}: {
  mode: InterruptLabMode
  threadId: string
  interruptedRunId: string
  activeInterruptIds: ReadonlyArray<string>
  serialized: string | null
}): Record<string, InterruptEditorDraft> {
  if (mode !== 'durable' || serialized === null) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return {}
  }
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    parsed.mode !== 'durable' ||
    parsed.threadId !== threadId ||
    parsed.interruptedRunId !== interruptedRunId ||
    !isRecord(parsed.drafts)
  ) {
    return {}
  }

  const restored: Record<string, InterruptEditorDraft> = {}
  for (const interruptId of activeInterruptIds) {
    const draft = parsed.drafts[interruptId]
    if (isInterruptEditorDraft(draft)) restored[interruptId] = draft
  }
  return restored
}

export function durableDraftStorageKey(
  threadId: string,
  interruptedRunId: string,
): string {
  return `tanstack-ai:interrupt-lab:drafts:durable:${threadId}:${interruptedRunId}`
}

export function durableOutcomeStatus(
  itemErrors: ReadonlyArray<{
    code: string
    retryable: boolean
    scope?: string
  }>,
  rootErrors: ReadonlyArray<{
    code: string
    retryable: boolean
    scope?: string
  }> = [],
): { kind: DurableOutcomeKind; label: string; detail: string } {
  const seen = new Set<string>()
  const errors = [...itemErrors, ...rootErrors].filter((error) => {
    const key = `${error.code}:${error.retryable}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (errors.some((error) => error.code === 'expired')) {
    return {
      kind: 'expired',
      label: 'Expired',
      detail: 'The authoritative interrupt batch is no longer resolvable.',
    }
  }
  if (errors.some((error) => error.code === 'conflict')) {
    return {
      kind: 'conflict',
      label: 'CAS conflict',
      detail: 'Another client committed a decision first.',
    }
  }
  if (errors.some((error) => error.code === 'stale')) {
    return {
      kind: 'stale',
      label: 'Stale generation',
      detail: 'This client submitted an outdated interrupt generation.',
    }
  }
  if (errors.some((error) => error.code === 'recovery-unavailable')) {
    return {
      kind: 'recovery-unavailable',
      label: 'Recovery unavailable',
      detail: 'The configured connection cannot load authoritative state.',
    }
  }
  if (errors.some((error) => error.retryable)) {
    return {
      kind: 'retryable',
      label: 'Retry available',
      detail: 'retryInterrupts() can replay the captured submission.',
    }
  }
  return {
    kind: 'protected',
    label: 'Atomic state protected',
    detail: 'No durable conflict, stale generation, or retryable failure.',
  }
}

export function durableCapabilityStatuses(
  mode: InterruptLabMode,
  state: { retryable: boolean; hasExpiresAt: boolean },
): ReadonlyArray<DurableCapabilityStatus> {
  if (mode !== 'durable') return []
  return [
    {
      id: 'saved-drafts',
      availability: 'available',
      detail: 'Editor drafts and the public resume snapshot survive reload.',
    },
    {
      id: 'cas-conflict',
      availability: 'available',
      detail: 'Open the same case in two tabs to exercise first-writer CAS.',
    },
    {
      id: 'retry',
      availability: state.retryable ? 'available' : 'observable-only',
      detail: state.retryable
        ? 'A captured failed submission can be replayed with retryInterrupts().'
        : 'Arm the one-shot resume failure before resolving a batch.',
    },
    {
      id: 'join-replay',
      availability: 'unavailable',
      detail:
        'The current lab endpoint is POST-only and exposes no GET join loader.',
    },
    {
      id: 'expiry',
      availability: 'observable-only',
      detail: state.hasExpiresAt
        ? 'The server advertised expiresAt; this UI only observes it.'
        : 'The lab store exposes no public TTL configuration for a trigger.',
    },
  ]
}
