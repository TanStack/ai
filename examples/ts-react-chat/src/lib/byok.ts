import { anthropicByok } from '@tanstack/ai-anthropic'
import { geminiByok } from '@tanstack/ai-gemini'
import { grokByok } from '@tanstack/ai-grok'
import { groqByok } from '@tanstack/ai-groq'
import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { openaiByok } from '@tanstack/ai-openai'
import { openrouterByok } from '@tanstack/ai-openrouter'
import type { ProviderId } from '@tanstack/ai/byok'
import type { Provider } from '@/lib/model-selection'

const KEYED_PROVIDERS = [
  openaiByok,
  anthropicByok,
  geminiByok,
  openrouterByok,
  groqByok,
  grokByok,
] as const

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: KEYED_PROVIDERS,
})

// Let the relay decide when a key is missing. The server prefers the
// `x-byok-*` header, then env. Without coverage, the client would block
// the send before env fallback can run.
byok.setServerCoverage(true)

export function toByokProvider(provider: Provider): ProviderId | undefined {
  if (provider === 'gemini-interactions') return geminiByok.id
  const match = KEYED_PROVIDERS.find((entry) => entry.id === provider)
  return match?.id
}
