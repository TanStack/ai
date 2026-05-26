import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'

export interface OpenRouterClientConfig {
  apiKey: string
  baseURL?: string
  httpReferer?: string
  xTitle?: string
}

export function getOpenRouterApiKeyFromEnv(): string {
  return getApiKeyFromEnv('OPENROUTER_API_KEY')
}

export function generateId(prefix: string): string {
  return _generateId(prefix)
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
