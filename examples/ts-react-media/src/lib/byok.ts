import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { byteplusByok } from '@tanstack/ai-byteplus/byok'
import { falByok } from '@tanstack/ai-fal/byok'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { reactorByok } from '@tanstack/ai-reactor/byok'
import { createServerFn } from '@tanstack/react-start'
import type { ProviderId } from '@tanstack/ai/byok'

export {
  byteplusByok,
  falByok,
  geminiByok,
  grokByok,
  openrouterByok,
  reactorByok,
}

export const KEYED_PROVIDERS = [
  falByok,
  geminiByok,
  grokByok,
  openrouterByok,
  byteplusByok,
  reactorByok,
] as const

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: KEYED_PROVIDERS,
})

// Let the relay decide when a key is missing. The server prefers the
// `x-byok-*` header, then env.
byok.setServerCoverage(true)

export function toByokProvider(
  provider: 'fal' | 'gemini' | 'xai' | 'byteplus' | 'openrouter' | 'reactor',
): ProviderId {
  if (provider === 'xai') return grokByok.id
  return provider
}

/** Booleans only — which keyed providers have an env key on the relay. */
export const getEnvKeyStatus = createServerFn({ method: 'GET' }).handler(
  (): Record<string, boolean> => {
    const status: Record<string, boolean> = {}
    for (const provider of KEYED_PROVIDERS) {
      status[provider.id] = (provider.env ?? []).some((name) =>
        Boolean(process.env[name]),
      )
    }
    return status
  },
)
