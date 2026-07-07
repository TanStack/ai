import { createServerFn } from '@tanstack/react-start'
import type { ProviderId } from '@tanstack/ai-byok'
import type { Provider } from '@/lib/model-selection'

/**
 * Maps the example's providers to a BYOK provider id and the env var(s) the
 * adapter reads server-side. Providers not listed (ollama = local, bedrock =
 * AWS credentials) don't use a single bring-your-own key.
 */
export const BYOK_PROVIDER_MAP: Partial<
  Record<Provider, { byokId: ProviderId; envVars: Array<string> }>
> = {
  openai: { byokId: 'openai', envVars: ['OPENAI_API_KEY'] },
  anthropic: { byokId: 'anthropic', envVars: ['ANTHROPIC_API_KEY'] },
  gemini: { byokId: 'gemini', envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
  'gemini-interactions': {
    byokId: 'gemini',
    envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  },
  grok: { byokId: 'grok', envVars: ['XAI_API_KEY'] },
  groq: { byokId: 'groq', envVars: ['GROQ_API_KEY'] },
  openrouter: { byokId: 'openrouter', envVars: ['OPENROUTER_API_KEY'] },
}

/** The BYOK provider id backing an example provider, if any. */
export function byokIdForProvider(provider: Provider): ProviderId | null {
  return BYOK_PROVIDER_MAP[provider]?.byokId ?? null
}

/**
 * Reports which BYOK-supported providers have their key set in the server env,
 * so the client can warn before a user picks a model it can't run. Returns only
 * booleans — never the key values.
 */
export const getEnvKeyStatus = createServerFn({ method: 'GET' }).handler(() => {
  const status: Partial<Record<ProviderId, boolean>> = {}
  for (const { byokId, envVars } of Object.values(BYOK_PROVIDER_MAP)) {
    status[byokId] = envVars.some((name) => Boolean(process.env[name]))
  }
  return status
})
