export interface OpenRouterClientConfig {
  apiKey: string
  baseURL?: string
  httpReferer?: string
  xTitle?: string
}

interface EnvObject {
  OPENROUTER_API_KEY?: string
}

interface WindowWithEnv {
  env?: EnvObject
}

function getEnvironment(): EnvObject | undefined {
  if (typeof globalThis !== 'undefined') {
    const win = (globalThis as { window?: WindowWithEnv }).window
    if (win?.env) {
      return win.env
    }
  }
  if (typeof process !== 'undefined') {
    return process.env as EnvObject
  }
  return undefined
}

export function getOpenRouterApiKeyFromEnv(): string {
  const env = getEnvironment()
  const key = env?.OPENROUTER_API_KEY

  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }

  return key
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

export function buildHeaders(
  config: OpenRouterClientConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (config.httpReferer) headers['HTTP-Referer'] = config.httpReferer
  if (config.xTitle) headers['X-Title'] = config.xTitle
  return headers
}
