/**
 * The provider registry the UI drives. Each provider maps to one Jev model
 * slug. The server function uses the literals, not this map, so adapter
 * generics keep the model type.
 */
export const PROVIDERS = [
  'ollaya',
  'typesafe',
  'openrouter',
  'vercel',
  'cloudflare',
  'openai',
] as const

export type Provider = (typeof PROVIDERS)[number]

export const PROVIDER_LABELS: Record<Provider, string> = {
  ollaya: 'Ollaya (local)',
  typesafe: 'TypeSafe',
  openrouter: 'OpenRouter',
  vercel: 'Vercel Gateway',
  cloudflare: 'Cloudflare',
  openai: 'OpenAI',
}

export const PROVIDER_MODELS: Record<Provider, string> = {
  ollaya: 'laya:latest',
  typesafe: 'jev-latest',
  openrouter: '~typesafe/jev-latest',
  vercel: 'typesafe-ai/jev',
  cloudflare: 'typesafe/jev',
  openai: 'gpt-6-luna',
}

/** Env vars each adapter reads, shown in the "no key" hint. */
export const PROVIDER_ENV_VARS: Record<Provider, ReadonlyArray<string>> = {
  // Ollaya runs locally with no key. Point elsewhere with OLLAYA_BASE_URL.
  ollaya: [],
  typesafe: ['TYPESAFE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  vercel: ['AI_GATEWAY_API_KEY'],
  cloudflare: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
  openai: ['OPENAI_API_KEY'],
}

export function isProvider(value: string): value is Provider {
  return PROVIDERS.some((provider) => provider === value)
}
