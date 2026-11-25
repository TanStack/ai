import type { Interrupt } from '@tanstack/ai'
import type { InterruptRecord } from './types'

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

export function hasReservedInterruptBinding(payload: unknown): boolean {
  const descriptor = objectValue(payload)
  const metadata = objectValue(descriptor?.metadata)
  return !!metadata && 'tanstack:interruptBinding' in metadata
}

export function isPersistedInterruptDescriptor(
  value: unknown,
): value is Interrupt & { reason: string; message: string } {
  const record = objectValue(value)
  return (
    !!record &&
    typeof record.id === 'string' &&
    typeof record.reason === 'string' &&
    typeof record.message === 'string'
  )
}

/**
 * Return true when a pending record belongs to the TanStack chat resume
 * protocol. Foreign AG-UI descriptors without a TanStack binding stay pending
 * for their owner and do not block chat resume.
 */
export function isChatOwnedPendingInterrupt(
  interrupt: InterruptRecord,
): boolean {
  return (
    !isPersistedInterruptDescriptor(interrupt.payload) ||
    hasReservedInterruptBinding(interrupt.payload)
  )
}

/**
 * Warn when a 0.x approval or client-tool record lacks `tanstack:interruptBinding`.
 */
export function warnIfUnboundToolInterrupt(interrupt: InterruptRecord): void {
  const kind = objectValue(interrupt.payload.metadata)?.kind
  if (
    (kind === 'approval' || kind === 'client_tool') &&
    typeof interrupt.payload.toolCallId === 'string'
  ) {
    console.warn(
      `[ai-persistence] Interrupt '${interrupt.interruptId}' is a 0.x ${kind} record with no 'tanstack:interruptBinding'. This chat cannot resume it, so it stays pending. Resolve or cancel it in the interrupt store.`,
    )
  }
}
