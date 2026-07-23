/**
 * Persistence capability tokens.
 *
 * `withPersistence` PROVIDES these so later middleware (and harness adapters)
 * can read durable state. The `locks` and `sandbox-store` tokens are shared with
 * `@tanstack/ai-sandbox` and live in core `@tanstack/ai` (their neutral home);
 * they are re-exported here so consumers import everything persistence-related
 * from one place.
 */
import { createCapability } from '@tanstack/ai'
import type { AIPersistence, InterruptStore } from './types'

export const PersistenceCapability =
  createCapability<AIPersistence>()('persistence')

export const InterruptsCapability = createCapability<InterruptStore>()(
  'persistence.interrupts',
)

export const [getPersistence, providePersistence] = PersistenceCapability
export const [getInterrupts, provideInterrupts] = InterruptsCapability

// Shared tokens from core (see ./locks for the locks note).
export { LocksCapability, getLocks, provideLocks } from './locks'
export {
  SandboxStoreCapability,
  getSandboxStore,
  provideSandboxStore,
} from '@tanstack/ai'
