/**
 * Persistence capability tokens.
 *
 * `withChatPersistence` PROVIDES these so later middleware (and harness adapters)
 * can read durable state. `LocksCapability` is re-exported from core
 * (`@tanstack/ai`) — a shared, single-owner token owned with the sandbox layer.
 */
import {
  InterruptPersistenceCapability,
  createCapability,
  getInterruptPersistence,
  provideInterruptPersistence,
} from '@tanstack/ai'
import { validatePersistenceStoreKeys } from './types'
import type { CapabilityContext } from '@tanstack/ai'
import type { AIPersistence } from './types'

export const PersistenceCapability =
  createCapability<AIPersistence>()('persistence')

export const [getPersistence, providePersistenceUnchecked] =
  PersistenceCapability

export function providePersistence(
  ctx: CapabilityContext,
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  providePersistenceUnchecked(ctx, persistence)
}

export {
  InterruptPersistenceCapability,
  getInterruptPersistence,
  provideInterruptPersistence,
}

/** @deprecated Use InterruptPersistenceCapability. Removed at 1.0. */
export const InterruptsCapability = InterruptPersistenceCapability
/** @deprecated Use getInterruptPersistence. Removed at 1.0. */
export const getInterrupts = getInterruptPersistence
/** @deprecated Use provideInterruptPersistence. Removed at 1.0. */
export const provideInterrupts = provideInterruptPersistence

// Shared, single-owner tokens live in core; re-export so consumers import
// everything persistence-related from this package.
export { LocksCapability, getLocks, provideLocks } from '@tanstack/ai'
