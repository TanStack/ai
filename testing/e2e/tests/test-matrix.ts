import type { Provider, Feature } from '../src/lib/types'
import { isSupported } from '../src/lib/feature-support'

/**
 * Provider × feature matrix for Playwright specs.
 *
 * The underlying `matrix` and `isSupported` are imported from
 * `src/lib/feature-support.ts` — that file is the single source of truth.
 * Any provider-exclusion notes (Gemini tool-approval, Gemini image-gen,
 * Ollama text-tool-text) live there.
 *
 * The `providers` iteration order below is the order specs run in. Keep it
 * stable to avoid unrelated churn in screenshots, logs, and grep filters.
 */

export const providers: Provider[] = [
  'openai',
  'anthropic',
  'gemini',
  'ollama',
  'groq',
  'grok',
  'openrouter',
]

export { isSupported }

/** Get only the providers that support a given feature */
export function providersFor(feature: Feature): Provider[] {
  return providers.filter((p) => isSupported(p, feature))
}
