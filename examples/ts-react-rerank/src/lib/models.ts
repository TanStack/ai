/**
 * The provider / model registry the UI drives.
 *
 * The model lists are the ones each adapter package exports, not copies — so
 * this example stays correct when a package gains a model.
 */
import { COHERE_RERANK_MODELS } from '@tanstack/ai-cohere'
import { OPENROUTER_RERANK_MODELS } from '@tanstack/ai-openrouter'

export const PROVIDERS = ['cohere', 'openrouter'] as const

export type Provider = (typeof PROVIDERS)[number]

export const PROVIDER_LABELS: Record<Provider, string> = {
  cohere: 'Cohere',
  openrouter: 'OpenRouter',
}

/** The env var each provider's adapter reads, shown in the "no key" hint. */
export const PROVIDER_ENV_VARS: Record<Provider, string> = {
  cohere: 'COHERE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
}

export const MODELS_BY_PROVIDER: Record<Provider, ReadonlyArray<string>> = {
  cohere: COHERE_RERANK_MODELS,
  // OpenRouter's rerank model type is open — any rerank slug it serves works,
  // so this list is autocomplete sugar rather than an exhaustive set.
  openrouter: OPENROUTER_RERANK_MODELS,
}

export function defaultModelFor(provider: Provider): string {
  const [first] = MODELS_BY_PROVIDER[provider]
  if (first === undefined) {
    throw new Error(`No rerank models registered for provider ${provider}`)
  }
  return first
}

export function isProvider(value: string): value is Provider {
  return PROVIDERS.some((provider) => provider === value)
}
