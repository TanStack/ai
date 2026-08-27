import { INTERRUPT_PAYLOAD_METADATA_KEY } from './interrupt-definition'
import { readUnopenedInterruptBinding } from './interrupt-resume'
import type { Interrupt } from './types'

export const INTERRUPT_CONTINUATION_METADATA_KEY =
  'tanstack:interruptContinuation' as const

export const INTERRUPT_CONTINUATION_VERSION = 1 as const

export interface GenericInterruptContinuation {
  v: typeof INTERRUPT_CONTINUATION_VERSION
  definitionId: string
  key: string
  batchIndex: number
  reason: string
  message: string
  expiresAt?: string
  responseSchemaHash?: string
  payloadSchemaHash?: string
  payload?: unknown
}

export type GenericInterruptContinuationReadResult =
  | { status: 'absent' }
  | { status: 'invalid'; message: string }
  | { status: 'ok'; value: GenericInterruptContinuation }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function invalid(
  message: string,
): Extract<GenericInterruptContinuationReadResult, { status: 'invalid' }> {
  return { status: 'invalid', message }
}

function hasInvalidContinuationFields(raw: Record<string, unknown>): boolean {
  return (
    raw.v !== INTERRUPT_CONTINUATION_VERSION ||
    typeof raw.definitionId !== 'string' ||
    typeof raw.key !== 'string' ||
    typeof raw.reason !== 'string' ||
    typeof raw.message !== 'string' ||
    typeof raw.batchIndex !== 'number' ||
    !Number.isInteger(raw.batchIndex) ||
    raw.batchIndex < 0 ||
    (raw.responseSchemaHash !== undefined &&
      typeof raw.responseSchemaHash !== 'string') ||
    (raw.expiresAt !== undefined && typeof raw.expiresAt !== 'string') ||
    (raw.payloadSchemaHash !== undefined &&
      typeof raw.payloadSchemaHash !== 'string')
  )
}

function continuationFromRaw(
  raw: Record<string, unknown>,
): GenericInterruptContinuation {
  const definitionId = raw.definitionId
  const key = raw.key
  const reason = raw.reason
  const message = raw.message
  const batchIndex = raw.batchIndex
  const expiresAt = raw.expiresAt
  const responseSchemaHash = raw.responseSchemaHash
  const payloadSchemaHash = raw.payloadSchemaHash
  return {
    v: INTERRUPT_CONTINUATION_VERSION,
    definitionId: typeof definitionId === 'string' ? definitionId : '',
    key: typeof key === 'string' ? key : '',
    batchIndex: typeof batchIndex === 'number' ? batchIndex : 0,
    reason: typeof reason === 'string' ? reason : '',
    message: typeof message === 'string' ? message : '',
    ...(typeof expiresAt === 'string' ? { expiresAt } : {}),
    ...(typeof responseSchemaHash === 'string' ? { responseSchemaHash } : {}),
    ...(typeof payloadSchemaHash === 'string' ? { payloadSchemaHash } : {}),
    ...(Object.prototype.hasOwnProperty.call(raw, 'payload')
      ? { payload: raw.payload }
      : {}),
  }
}

export function readGenericInterruptContinuation(
  metadata: unknown,
): GenericInterruptContinuationReadResult {
  if (metadata === undefined) return { status: 'absent' }
  if (!isRecord(metadata)) {
    return invalid('Generic interrupt resume metadata must be an object.')
  }
  if (
    !Object.prototype.hasOwnProperty.call(
      metadata,
      INTERRUPT_CONTINUATION_METADATA_KEY,
    )
  ) {
    return { status: 'absent' }
  }
  const raw = metadata[INTERRUPT_CONTINUATION_METADATA_KEY]
  if (!isRecord(raw)) {
    return invalid('Generic interrupt continuation is invalid.')
  }
  if (hasInvalidContinuationFields(raw)) {
    return invalid('Generic interrupt continuation contains invalid fields.')
  }
  return { status: 'ok', value: continuationFromRaw(raw) }
}

/** Put a parsed continuation on `ResumeEntry.metadata`. */
export function wrapGenericInterruptContinuation(
  continuation: GenericInterruptContinuation,
): Record<string, unknown> {
  return { [INTERRUPT_CONTINUATION_METADATA_KEY]: continuation }
}

export function genericInterruptContinuationFromDescriptor(
  interrupt: Interrupt,
): GenericInterruptContinuation | undefined {
  const binding = readUnopenedInterruptBinding(interrupt)
  if (
    binding?.kind !== 'generic' ||
    binding.definitionId === undefined ||
    binding.key === undefined ||
    binding.batchIndex === undefined
  ) {
    return undefined
  }
  const metadata = isRecord(interrupt.metadata) ? interrupt.metadata : undefined
  const hasPayload =
    metadata !== undefined &&
    Object.prototype.hasOwnProperty.call(
      metadata,
      INTERRUPT_PAYLOAD_METADATA_KEY,
    )
  return {
    v: INTERRUPT_CONTINUATION_VERSION,
    definitionId: binding.definitionId,
    key: binding.key,
    batchIndex: binding.batchIndex,
    reason: interrupt.reason,
    message: interrupt.message ?? '',
    ...(interrupt.expiresAt !== undefined
      ? { expiresAt: interrupt.expiresAt }
      : {}),
    ...(binding.responseSchemaHash !== undefined
      ? { responseSchemaHash: binding.responseSchemaHash }
      : {}),
    ...(binding.payloadSchemaHash !== undefined
      ? { payloadSchemaHash: binding.payloadSchemaHash }
      : {}),
    ...(hasPayload
      ? { payload: metadata[INTERRUPT_PAYLOAD_METADATA_KEY] }
      : {}),
  }
}
