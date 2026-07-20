import { createCapability } from './activities/chat/middleware/capabilities'
import {
  canonicalInterruptJson,
  cloneAndDeepFreezeJson,
  digestInterruptJson,
} from './interrupt-serialization'
import type { Interrupt, RunAgentResumeItem } from './types'

export interface OpenInterruptBatchInput {
  threadId: string
  interruptedRunId: string
  descriptors: ReadonlyArray<Interrupt>
  bindings: ReadonlyArray<UnopenedInterruptBinding>
}

export interface CommitInterruptResolutionsInput {
  threadId: string
  interruptedRunId: string
  continuationRunId: string
  expectedGeneration: number
  expectedInterruptIds: ReadonlyArray<string>
  resolutions: ReadonlyArray<RunAgentResumeItem>
  fingerprint: string
  canonicalResolutions: string
}

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
  | 'persistence-required'
  | 'atomic-commit-unsupported'
  | 'recovery-unavailable'
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

export type InterruptBinding =
  | {
      kind: 'tool-approval'
      interruptId: string
      interruptedRunId: string
      generation: number
      toolName: string
      toolCallId: string
      originalArgs: unknown
      inputSchemaHash: string
      approvalSchemaHash: string
      responseSchemaHash: string
      expiresAt?: string
    }
  | {
      kind: 'client-tool-execution'
      interruptId: string
      interruptedRunId: string
      generation: number
      toolName: string
      toolCallId: string
      outputSchemaHash: string
      responseSchemaHash: string
      expiresAt?: string
    }
  | {
      kind: 'generic'
      interruptId: string
      interruptedRunId: string
      generation: number
      responseSchemaHash: string
      expiresAt?: string
    }

export type UnopenedInterruptBinding = InterruptBinding extends infer TBinding
  ? TBinding extends InterruptBinding
    ? Omit<TBinding, 'interruptedRunId' | 'generation'>
    : never
  : never

export type InterruptCommitResult =
  | { status: 'committed'; continuationRunId: string }
  | { status: 'replayed'; continuationRunId: string }
  | {
      status: 'conflict'
      authoritativeState: InterruptRecoveryStateV1
    }

export interface InterruptRecoveryQuery {
  threadId: string
  interruptedRunId: string
  knownGeneration: number
}

export interface InterruptRecoveryStateV1 extends InterruptCorrelation {
  schemaVersion: 1
  state: 'pending' | 'committed' | 'expired' | 'missing' | 'legacy-committed'
  pendingInterrupts: ReadonlyArray<Interrupt>
  committed?: {
    fingerprint: string
    resolutions?: ReadonlyArray<RunAgentResumeItem>
    continuationRunId?: string
    committedAt: string
  }
}

export interface InterruptPersistenceGateway {
  openInterruptBatch: (
    input: OpenInterruptBatchInput,
  ) => Promise<{ generation: number; descriptors: ReadonlyArray<Interrupt> }>
  commitInterruptResolutions: (
    input: CommitInterruptResolutionsInput,
  ) => Promise<InterruptCommitResult>
  getInterruptRecoveryState: (
    input: InterruptRecoveryQuery,
  ) => Promise<InterruptRecoveryStateV1>
}

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

export const InterruptPersistenceCapability =
  createCapability<InterruptPersistenceGateway>()('interrupt-persistence')

export const [getInterruptPersistence, provideInterruptPersistence] =
  InterruptPersistenceCapability
