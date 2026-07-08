/**
 * Shared provider registry and header-naming convention.
 *
 * This module is fully isomorphic (no browser or Node APIs) and is the single
 * source of truth imported by both the client keyring and the server helpers.
 */

/**
 * Describes how to validate a key against a provider's cheapest authenticated
 * endpoint (typically a models list). `headers` builds the request headers
 * from the raw key. Only providers that expose a browser-reachable endpoint
 * carry a `validate` entry; the rest report `'unsupported'` from
 * {@link validateKey}.
 */
export interface ProviderValidateConfig {
  /** Endpoint hit with a GET request to confirm the key works. */
  url: string
  /** Builds the auth headers for the validation request from the raw key. */
  headers: (key: string) => Record<string, string>
}

/** Static metadata for a supported provider. */
export interface ProviderConfig {
  /** Stable id used in the keyring map and the per-provider header name. */
  id: string
  /** Human-readable label for UI. */
  label: string
  /** Optional validation endpoint metadata. */
  validate?: ProviderValidateConfig
}

const ANTHROPIC_HEADERS = (key: string): Record<string, string> => ({
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  // Required for Anthropic to serve the request from a browser origin.
  'anthropic-dangerous-direct-browser-access': 'true',
})

const bearer = (key: string): Record<string, string> => ({
  Authorization: `Bearer ${key}`,
})

/**
 * Registry of providers the BYOK toolkit understands. `ProviderId` is derived
 * from these keys, so adding a provider here extends the typed union
 * everywhere.
 */
export const BYOK_PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    validate: { url: 'https://api.openai.com/v1/models', headers: bearer },
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    validate: {
      url: 'https://api.anthropic.com/v1/models',
      headers: ANTHROPIC_HEADERS,
    },
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    validate: {
      // Gemini authenticates the models list via a query param, not a header.
      url: 'https://generativelanguage.googleapis.com/v1beta/models',
      headers: (key) => ({ 'x-goog-api-key': key }),
    },
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    validate: { url: 'https://openrouter.ai/api/v1/key', headers: bearer },
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    validate: {
      url: 'https://api.groq.com/openai/v1/models',
      headers: bearer,
    },
  },
  grok: {
    id: 'grok',
    label: 'xAI Grok',
    validate: { url: 'https://api.x.ai/v1/models', headers: bearer },
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    validate: { url: 'https://api.mistral.ai/v1/models', headers: bearer },
  },
  elevenlabs: {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    validate: {
      url: 'https://api.elevenlabs.io/v1/user',
      headers: (key) => ({ 'xi-api-key': key }),
    },
  },
  // No browser-reachable validation endpoint (key-scheme auth, no models list).
  fal: { id: 'fal', label: 'fal.ai' },
  // Local runtime, no API key involved.
  ollama: { id: 'ollama', label: 'Ollama' },
} as const satisfies Record<string, ProviderConfig>

/** Union of every supported provider id. */
export type ProviderId = keyof typeof BYOK_PROVIDERS

/** All provider ids as a runtime array. */
export const PROVIDER_IDS = Object.keys(BYOK_PROVIDERS) as Array<ProviderId>

/** Type guard narrowing an arbitrary string to a known {@link ProviderId}. */
export function isProviderId(value: string): value is ProviderId {
  return value in BYOK_PROVIDERS
}

/**
 * The validation config for a provider, or `undefined` when the provider has no
 * browser-reachable validation endpoint.
 */
export function providerValidateConfig(
  provider: ProviderId,
): ProviderValidateConfig | undefined {
  const config = BYOK_PROVIDERS[provider]
  return 'validate' in config ? config.validate : undefined
}

/** Prefix for every per-provider BYOK header. */
export const BYOK_HEADER_PREFIX = 'x-byok-'

/**
 * The HTTP header name that carries the key for a given provider. Keys always
 * travel in this header, never in the request body or message history, so they
 * stay out of persisted conversations and the event/observability stream.
 */
export function byokHeaderName(provider: ProviderId): string {
  return `${BYOK_HEADER_PREFIX}${provider}`
}
