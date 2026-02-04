/**
 * Vendor configuration for E2E tests
 *
 * Defines all supported AI providers and their configuration for testing.
 */

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'openrouter'

export interface ProviderConfig {
  /** Unique identifier matching the panel's provider type */
  id: ProviderId
  /** Human-readable name for test descriptions */
  name: string
  /** Environment variable key for API key (null if not required) */
  envKey: string | null
  /** Default model to use for testing */
  defaultModel: string
  /** Whether this provider reliably supports basic chat inference */
  supportsBasicInference: boolean
  /** Whether this provider reliably supports tool calling */
  supportsTools: boolean
  /** Whether this provider supports summarization */
  supportsSummarization: boolean
  /** Whether this provider supports streaming summarization */
  supportsStreamingSummarization: boolean
}

/**
 * All supported providers and their configurations
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    supportsBasicInference: true,
    supportsTools: true,
    supportsSummarization: true,
    supportsStreamingSummarization: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-5-20250929',
    supportsBasicInference: true,
    supportsTools: true,
    supportsSummarization: true,
    supportsStreamingSummarization: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.0-flash',
    supportsBasicInference: true,
    supportsTools: true,
    supportsSummarization: true,
    supportsStreamingSummarization: true,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    envKey: null, // Ollama runs locally, no API key needed
    defaultModel: 'mistral:7b',
    supportsBasicInference: true,
    supportsTools: false, // Smaller local models may not reliably call tools
    supportsSummarization: true,
    supportsStreamingSummarization: true,
  },
  {
    id: 'grok',
    name: 'Grok',
    envKey: 'XAI_API_KEY',
    defaultModel: 'grok-3-mini',
    supportsBasicInference: true,
    supportsTools: true,
    supportsSummarization: true,
    supportsStreamingSummarization: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'openai/gpt-4o-mini',
    supportsBasicInference: false, // Chat via OpenRouter returns empty responses inconsistently
    supportsTools: false, // Tool calling via OpenRouter is unreliable due to backend variations
    supportsSummarization: true,
    supportsStreamingSummarization: true,
  },
]

/**
 * Check if a provider is available (has required API key configured)
 */
export function isProviderAvailable(provider: ProviderConfig): boolean {
  // Ollama doesn't require an API key
  if (provider.envKey === null) {
    return true
  }

  // Check for the API key in environment
  const apiKey = process.env[provider.envKey]
  return Boolean(apiKey && apiKey.length > 0)
}

/**
 * Get a provider by ID
 */
export function getProvider(id: ProviderId): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

/**
 * Get all available providers (those with API keys configured)
 */
export function getAvailableProviders(): ProviderConfig[] {
  return PROVIDERS.filter(isProviderAvailable)
}

/**
 * Get providers that support basic inference (chat)
 */
export function getInferenceCapableProviders(): ProviderConfig[] {
  return PROVIDERS.filter(
    (p) => p.supportsBasicInference && isProviderAvailable(p),
  )
}

/**
 * Get providers that support tool calling
 */
export function getToolCapableProviders(): ProviderConfig[] {
  return PROVIDERS.filter((p) => p.supportsTools && isProviderAvailable(p))
}

/**
 * Get providers that support summarization
 */
export function getSummarizationCapableProviders(): ProviderConfig[] {
  return PROVIDERS.filter(
    (p) => p.supportsSummarization && isProviderAvailable(p),
  )
}

/**
 * Get providers that support streaming summarization
 */
export function getStreamingSummarizationCapableProviders(): ProviderConfig[] {
  return PROVIDERS.filter(
    (p) => p.supportsStreamingSummarization && isProviderAvailable(p),
  )
}
