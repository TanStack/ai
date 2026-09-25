/**
 * Persistence capability tokens.
 *
 * `withPersistence` PROVIDES persistence/interrupts so later middleware can
 * read durable chat state. Locks live in `@tanstack/ai/locks` (`withLocks`).
 */
import { createCapability } from '@tanstack/ai'
import type { AIPersistence, InterruptStore } from './types'

export interface PersistenceCompletion {
  /** Resolves after successful terminal persistence, or rejects with the original run error or abort reason after terminal persistence settles. */
  waitForRunCompletion: () => Promise<void>
}

export const PersistenceCapability =
  createCapability<AIPersistence>()('persistence')

export const InterruptsCapability = createCapability<InterruptStore>()(
  'persistence.interrupts',
)

export const PersistenceCompletionCapability =
  createCapability<PersistenceCompletion>()('persistence.completion')

export const [getPersistence, providePersistence] = PersistenceCapability
export const [getInterrupts, provideInterrupts] = InterruptsCapability
export const [getPersistenceCompletion, providePersistenceCompletion] =
  PersistenceCompletionCapability
