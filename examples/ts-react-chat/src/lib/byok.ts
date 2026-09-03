import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { byteplusByok, byteplusVoiceByok } from '@tanstack/ai-byteplus/byok'
import {
  cloudflareAccountByok,
  cloudflareByok,
} from '@tanstack/ai-cloudflare/byok'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { groqByok } from '@tanstack/ai-groq/byok'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { createServerFn } from '@tanstack/react-start'
import type { ProviderId } from '@tanstack/ai/byok'
import type { Provider } from '@/lib/model-selection'

export const KEYED_PROVIDERS = [
  openaiByok,
  anthropicByok,
  geminiByok,
  openrouterByok,
  groqByok,
  grokByok,
  byteplusByok,
  byteplusVoiceByok,
  cloudflareByok,
  cloudflareAccountByok,
] as const

/**
 * Providers whose credential is more than one value. The store still keeps
 * one entry per id (so env fallback and relay headers work per value), but
 * the key dialog shows each group as a single card.
 */
export const KEY_GROUPS = [
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    fields: [
      { provider: cloudflareAccountByok, label: 'Account ID', secret: false },
      { provider: cloudflareByok, label: 'API token', secret: true },
    ],
  },
] as const

export const byok = defineByok({
  storage: defaultByokStorage(),
})

// Let the relay decide when a key is missing. The server prefers the
// `x-byok-*` header, then env. Without coverage, the client would block
// the send before env fallback can run.
byok.setServerCoverage(true)

/** Every stored id a provider needs on the wire (grouped credentials send several). */
export function toByokProviders(provider: Provider): Array<ProviderId> {
  const single = toByokProvider(provider)
  const group = KEY_GROUPS.find((g) =>
    g.fields.some((f) => f.provider.id === single),
  )
  return group ? group.fields.map((f) => f.provider.id) : single ? [single] : []
}

export function toByokProvider(provider: Provider): ProviderId | undefined {
  if (provider === 'gemini-interactions') return geminiByok.id
  const match = KEYED_PROVIDERS.find((entry) => entry.id === provider)
  return match?.id
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
