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
 * Gemini). Features that none of them support still run against whatever
 * providers do. That fallback applies only to this implicit default.
 * CI and `E2E_PROVIDERS=*` keep the full matrix. A comma-separated list
 * (`E2E_PROVIDERS=grok`) runs only those providers.
 */
const LOCAL_E2E_PROVIDERS: ReadonlySet<Provider> = new Set([
  'openai',
  'anthropic',
  'gemini',
])

function requestedProviders(env: NodeJS.ProcessEnv = process.env) {
  if (env.CI) return { kind: 'all' }
  const raw = env.E2E_PROVIDERS
  if (raw === undefined || raw.trim() === '') {
    return {
      kind: 'subset',
      providers: LOCAL_E2E_PROVIDERS,
      fallbackWhenEmpty: true,
    }
  }
  if (raw.trim() === '*') return { kind: 'all' }

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
  return {
    kind: 'subset',
    providers: new Set(providers.filter((p) => tokens.includes(p))),
    fallbackWhenEmpty: false,
  }
}

/** Get only the providers that support a given feature */
export function providersFor(
  feature: Feature,
  env: NodeJS.ProcessEnv = process.env,
) {
  const supported = providers.filter((p) => isSupported(p, feature))
  const requested = requestedProviders(env)
  if (requested.kind === 'all') return supported
  const filtered = supported.filter((p) => requested.providers.has(p))
  if (filtered.length > 0 || !requested.fallbackWhenEmpty) return filtered
  return supported
}
