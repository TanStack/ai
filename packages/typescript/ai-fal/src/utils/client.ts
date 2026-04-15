import { fal } from '@fal-ai/client'
import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'

export interface FalClientConfig {
  apiKey: string
  proxyUrl?: string
}

export function getFalApiKeyFromEnv(): string {
  return getApiKeyFromEnv('FAL_KEY')
}

export function configureFalClient(config?: FalClientConfig): void {
  if (config?.proxyUrl) {
    fal.config({
      proxyUrl: config.proxyUrl,
    })
  } else {
    const apiKey = config?.apiKey ?? getFalApiKeyFromEnv()
    if (!apiKey) {
      throw new Error('API key is required')
    }
    fal.config({
      credentials: apiKey,
    })
  }
}

export function generateId(prefix: string): string {
  return _generateId(prefix)
}
