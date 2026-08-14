import { INTERRUPT_PAYLOAD_METADATA_KEY } from './interrupt-definition'
import { readUnopenedInterruptBinding } from './interrupt-resume'
import type { Interrupt } from './types'

/**
 * `ResumeEntry.metadata` key for a first-party generic request.
 *
 * AG-UI `resume` only carries the answer (`interruptId`, `status`, `payload`).
 * The original request rides here so an ephemeral server can rebuild it.
 */
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

/**
 * Read one generic request from `resume[].metadata`.
 *
 * Missing key means this resume item is not a first-party generic continuation.
 * A present key that fails the shape is a protocol error.
 */
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
  if (
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
  ) {
    return invalid('Generic interrupt continuation contains invalid fields.')
  }
  return {
    status: 'ok',
    value: {
      v: INTERRUPT_CONTINUATION_VERSION,
      definitionId: raw.definitionId,
      key: raw.key,
      batchIndex: raw.batchIndex,
      reason: raw.reason,
      message: raw.message,
      ...(typeof raw.expiresAt === 'string'
        ? { expiresAt: raw.expiresAt }
        : {}),
      ...(typeof raw.responseSchemaHash === 'string'
        ? { responseSchemaHash: raw.responseSchemaHash }
        : {}),
      ...(typeof raw.payloadSchemaHash === 'string'
        ? { payloadSchemaHash: raw.payloadSchemaHash }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(raw, 'payload')
        ? { payload: raw.payload }
        : {}),
    },
  }
}

/** Put a parsed continuation on `ResumeEntry.metadata`. */
export function wrapGenericInterruptContinuation(
  continuation: GenericInterruptContinuation,
): Record<string, unknown> {
  return { [INTERRUPT_CONTINUATION_METADATA_KEY]: continuation }
}

/**
 * Build the resume-metadata continuation from an outbound AG-UI interrupt.
 *
 * Returns `undefined` when the descriptor is not a first-party generic item.
 */
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
