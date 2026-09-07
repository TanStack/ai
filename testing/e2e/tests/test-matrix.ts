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
  'vertex',
  'vertex-grok',
  'vertex-mistral',
  'ollama',
  'groq',
  'grok',
  'bedrock',
  'bedrock-responses',
  'openrouter',
  'openrouter-responses',
  'vercel-gateway',
  'vercel-gateway-responses',
  'lovable',
  'lovable-responses',
  'openai-compatible',
  'openai-compatible-legacy',
  'mistral',
  'byteplus',
  'elevenlabs',
  'llmgateway',
  'cloudflare',
]

export { isSupported }

/**
 * Local `pnpm test:e2e` runs these adapter families (OpenAI, Anthropic,
 * Gemini). Features that none of them support (TTS, image-gen, …) still
 * run against whatever providers do. CI and `E2E_PROVIDERS=*` keep the
 * full matrix. Comma-separated ids narrow it further (`E2E_PROVIDERS=grok`).
 */
const LOCAL_E2E_PROVIDERS: ReadonlySet<Provider> = new Set([
  'openai',
  'anthropic',
  'gemini',
])

function requestedProviders(): 'all' | ReadonlySet<Provider> {
  if (process.env.CI) return 'all'
  const raw = process.env.E2E_PROVIDERS
  if (raw === undefined || raw.trim() === '') return LOCAL_E2E_PROVIDERS
  if (raw.trim() === '*') return 'all'

  const tokens = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const known = new Set<string>(providers)
  const unknown = tokens.filter((t) => !known.has(t))
  if (unknown.length > 0) {
    throw new Error(
      `E2E_PROVIDERS has unknown provider(s): ${unknown.join(', ')}. Known: ${providers.join(', ')}`,
    )
  }
  return new Set(providers.filter((p) => tokens.includes(p)))
}

/** Get only the providers that support a given feature */
export function providersFor(feature: Feature): Provider[] {
  const supported = providers.filter((p) => isSupported(p, feature))
  const requested = requestedProviders()
  if (requested === 'all') return supported
  const filtered = supported.filter((p) => requested.has(p))
  // Feature only exists on providers outside the local default (e.g. TTS
  // on elevenlabs). Keep those tests; don't silently drop the feature.
  return filtered.length > 0 ? filtered : supported
}
