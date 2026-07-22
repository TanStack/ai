import {
  canonicalInterruptJson,
  cloneAndDeepFreezeJson,
  digestInterruptJson,
} from './interrupt-serialization'
import type { RunAgentResumeItem } from './types'

export interface InterruptCorrelation {
  threadId: string
  interruptedRunId: string
  generation: number
  submissionId?: string
  continuationRunId?: string
}

export type ItemInterruptErrorCode =
  | 'invalid-payload'
  | 'invalid-edited-args'
  | 'invalid-tool-output'
  | 'invalid-response-schema'
  | 'unknown-interrupt'
  | 'expired'
  | 'stale'
  | 'conflict'
  | 'legacy-unsupported'

export type BatchInterruptErrorCode =
  | 'incomplete-batch'
  | 'item-validation-failed'
  | 'unsupported-bulk-operation'
  | 'async-resolver'
  | 'inactive-transaction'
  | 'mixed-provenance'
  | 'transport'
  | 'server'
  | 'protocol'
  | 'invalid-response-schema'
  | 'expired'
  | 'stale'
  | 'conflict'
  | 'legacy-submit-failed'

export interface ItemInterruptError extends InterruptCorrelation {
  scope: 'item'
  interruptId: string
  code: ItemInterruptErrorCode
  message: string
  path?: ReadonlyArray<string | number>
  source: 'client' | 'server'
  retryable: boolean
}

export interface BatchInterruptError extends InterruptCorrelation {
  scope: 'batch'
  code: BatchInterruptErrorCode
  message: string
  source: 'client' | 'server' | 'transport'
  retryable: boolean
  interruptIds: ReadonlyArray<string>
}

export type InterruptSubmissionError = ItemInterruptError | BatchInterruptError

/**
 * Wire version of {@link InterruptBinding}.
 *
 * The binding is the only part of an AG-UI `Interrupt` that this package
 * claims — it rides in `metadata` under
 * {@link INTERRUPT_BINDING_METADATA_KEY} and tells the resume path how to
 * correlate an answer back to a paused run. Producers stamp `v`; readers
 * reject any version they don't understand rather than duck-typing the fields.
 *
 * That matters because an AG-UI `Interrupt` is a shared envelope. Another
 * producer — a workflow engine projecting a durable approval, a third-party
 * agent — can legitimately put its own binding in the same envelope. Versioning
 * makes "not mine" a clean rejection instead of a partial match that resumes
 * against the wrong owner.
 */
export const INTERRUPT_BINDING_VERSION = 1 as const

interface InterruptBindingBase {
  /** @see INTERRUPT_BINDING_VERSION */
  v: typeof INTERRUPT_BINDING_VERSION
  interruptId: string
  interruptedRunId: string
  generation: number
  responseSchemaHash: string
  expiresAt?: string
}

export type InterruptBinding =
  | (InterruptBindingBase & {
      kind: 'tool-approval'
      toolName: string
      toolCallId: string
      originalArgs: unknown
      inputSchemaHash: string
      approvalSchemaHash: string
    })
  | (InterruptBindingBase & {
      kind: 'client-tool-execution'
      toolName: string
      toolCallId: string
      outputSchemaHash: string
    })
  | (InterruptBindingBase & {
      kind: 'generic'
    })

export type UnopenedInterruptBinding = InterruptBinding extends infer TBinding
  ? TBinding extends InterruptBinding
    ? Omit<TBinding, 'interruptedRunId' | 'generation'>
    : never
  : never

export type ToolApprovalResolution =
  | boolean
  | {
      approved: true
      editedArgs?: unknown
      payload?: unknown
    }
  | {
      approved: false
      payload?: unknown
      editedArgs?: never
    }

export function canonicalizeInterruptResolutions(
  resolutions: ReadonlyArray<RunAgentResumeItem>,
): {
  resolutions: ReadonlyArray<RunAgentResumeItem>
  canonicalResolutions: string
  fingerprint: string
} {
  const sorted = [...resolutions].sort((left, right) =>
    left.interruptId.localeCompare(right.interruptId),
  )
  const frozen = cloneAndDeepFreezeJson(sorted)
  const canonicalResolutions = canonicalInterruptJson(frozen)
  return Object.freeze({
    resolutions: frozen,
    canonicalResolutions,
    fingerprint: digestInterruptJson(canonicalResolutions),
  })
}
