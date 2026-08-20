import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { groqByok } from '@tanstack/ai-groq/byok'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
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
