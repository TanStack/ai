import { isProviderId } from './providers'
import type { ProviderId } from './providers'

/** Discriminated body returned by {@link byokMissing}. */
export interface ByokMissingBody {
  error: {
    type: 'byok_missing'
    provider: ProviderId
    message: string
  }
}

/** Type guard for a {@link ByokMissingBody} parsed from a response. */
export function isByokMissingBody(value: unknown): value is ByokMissingBody {
  if (typeof value !== 'object' || value === null) return false
  const { error } = value as { error?: unknown }
  if (typeof error !== 'object' || error === null) return false
  const typed = error as { type?: unknown; provider?: unknown }
  return (
    typed.type === 'byok_missing' &&
    typeof typed.provider === 'string' &&
    isProviderId(typed.provider)
  )
}
