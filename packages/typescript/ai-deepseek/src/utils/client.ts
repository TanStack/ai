import OpenAI_SDK from 'openai'

export interface DeepSeekClientConfig {
  apiKey: string
  baseURL?: string
}

/**
 * Creates a DeepSeek SDK client instance using OpenAI SDK with DeepSeek's base URL
 */
export function createDeepSeekClient(config: DeepSeekClientConfig): OpenAI_SDK {
  return new OpenAI_SDK({
    apiKey: config.apiKey,
    baseURL: config.baseURL || 'https://api.deepseek.com',
  })
}

/**
 * Gets DeepSeek API key from environment variables
 * @throws Error if DEEPSEEK_API_KEY is not found
 */
export function getDeepSeekApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.DEEPSEEK_API_KEY

  if (!key) {
    throw new Error(
      'DEEPSEEK_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
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
