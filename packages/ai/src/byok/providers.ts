export interface ProviderValidateConfig {
  url: string
  headers: (key: string) => Record<string, string>
}

export interface ProviderConfig {
  id: string
  label: string
  validate?: ProviderValidateConfig
}

const ANTHROPIC_HEADERS = (key: string): Record<string, string> => ({
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
})

const bearer = (key: string): Record<string, string> => ({
  Authorization: `Bearer ${key}`,
})

export const BYOK_PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    validate: {
      url: 'https://api.openai.com/v1/models',
      headers: bearer,
    },
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
      url: 'https://generativelanguage.googleapis.com/v1beta/models',
      headers: (key) => ({ 'x-goog-api-key': key }),
    },
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    validate: {
      url: 'https://openrouter.ai/api/v1/key',
      headers: bearer,
    },
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
    validate: {
      url: 'https://api.x.ai/v1/models',
      headers: bearer,
    },
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    validate: {
      url: 'https://api.mistral.ai/v1/models',
      headers: bearer,
    },
  },
  elevenlabs: {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    validate: {
      url: 'https://api.elevenlabs.io/v1/user',
      headers: (key) => ({ 'xi-api-key': key }),
    },
  },
  fal: { id: 'fal', label: 'fal.ai' },
  ollama: { id: 'ollama', label: 'Ollama' },
} as const satisfies Record<string, ProviderConfig>

export type ProviderId = keyof typeof BYOK_PROVIDERS

function keysOf<T extends object>(object: T): Array<keyof T & string> {
  return Object.keys(object) as Array<keyof T & string>
}

export const PROVIDER_IDS = keysOf(BYOK_PROVIDERS)

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.some((id) => id === value)
}

export function providerValidateConfig(
  provider: ProviderId,
): ProviderValidateConfig | undefined {
  const config = BYOK_PROVIDERS[provider]
  return 'validate' in config ? config.validate : undefined
}

export const BYOK_HEADER_PREFIX = 'x-byok-'

export function byokHeaderName(provider: ProviderId): string {
  return `${BYOK_HEADER_PREFIX}${provider}`
}
