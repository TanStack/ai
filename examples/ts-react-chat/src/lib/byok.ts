import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { PROVIDER_IDS, isProviderId } from '@tanstack/ai/byok'
import type { ProviderId } from '@tanstack/ai/byok'
import type { Provider } from '@/lib/model-selection'

export const byok = defineByok({ storage: defaultByokStorage() })

function allProviderCoverage(): Partial<Record<ProviderId, boolean>> {
  const flags: Partial<Record<ProviderId, boolean>> = {}
  for (const id of PROVIDER_IDS) {
    flags[id] = true
  }
  return flags
}

// Let the relay decide when a key is missing. The server prefers the
// `x-byok-*` header, then env. Without coverage, the client would block
// the send before env fallback can run.
byok.setServerCoverage(allProviderCoverage())

export function toByokProvider(provider: Provider): ProviderId | undefined {
  if (provider === 'gemini-interactions') return 'gemini'
  if (isProviderId(provider)) return provider
  return undefined
}
