/**
 * The provider registry the UI drives. Each provider maps to one Jev model
 * slug. The server function uses the literals, not this map, so adapter
 * generics keep the model type.
 */
export const PROVIDERS = [
  'typesafe',
  'openrouter',
  'vercel',
  'cloudflare',
] as const

export type Provider = (typeof PROVIDERS)[number]

export const PROVIDER_LABELS: Record<Provider, string> = {
  typesafe: 'TypeSafe',
  openrouter: 'OpenRouter',
  vercel: 'Vercel Gateway',
  cloudflare: 'Cloudflare',
}

export const PROVIDER_MODELS: Record<Provider, string> = {
  typesafe: 'jev-latest',
  openrouter: '~typesafe/jev-latest',
  vercel: 'typesafe-ai/jev',
  cloudflare: 'typesafe/jev',
}

/** Env vars each adapter reads, shown in the "no key" hint. */
export const PROVIDER_ENV_VARS: Record<Provider, ReadonlyArray<string>> = {
  typesafe: ['TYPESAFE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  vercel: ['AI_GATEWAY_API_KEY'],
  cloudflare: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
}

export function isProvider(value: string): value is Provider {
  return PROVIDERS.some((provider) => provider === value)
}
