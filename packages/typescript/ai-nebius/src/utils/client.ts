import OpenAI_SDK from 'openai'

export interface NebiusClientConfig {
  apiKey: string
  baseURL?: string
}

/**
 * Creates an OpenAI SDK client instance configured for Nebius Token Factory
 */
export function createNebiusClient(config: NebiusClientConfig): OpenAI_SDK {
  return new OpenAI_SDK({
    apiKey: config.apiKey,
    baseURL: config.baseURL || 'https://api.tokenfactory.nebius.com/v1/',
  })
}

/**
 * Gets Nebius API key from environment variables
 * @throws Error if NEBIUS_API_KEY is not found
 */
export function getNebiusApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.NEBIUS_API_KEY

  if (!key) {
    throw new Error(
      'NEBIUS_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }

  return key
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
