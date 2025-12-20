import OpenAI_SDK from 'openai'

export interface OpenAIClientConfig {
  apiKey: string
  organization?: string
  baseURL?: string
}

/**
 * Creates an OpenAI SDK client instance
 */
export function createOpenAIClient(config: OpenAIClientConfig): OpenAI_SDK {
  return new OpenAI_SDK({
    apiKey: config.apiKey,
    organization: config.organization,
    baseURL: config.baseURL,
  })
}

/**
 * Gets OpenAI API key from environment variables
 * @throws Error if OPENAI_API_KEY is not found
 */
export function getOpenAIApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.OPENAI_API_KEY

  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
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
