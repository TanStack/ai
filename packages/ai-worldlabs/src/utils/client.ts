import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import { createClient, createConfig } from '../generated/client/index'
import type { Client } from '../generated/client/index'

export const DEFAULT_WORLDLABS_API_URL = 'https://api.worldlabs.ai'

export interface WorldLabsClientConfig {
  apiKey?: string
  baseUrl?: string
  fetch?: typeof fetch
  defaultHeaders?: Record<string, string>
}

export function getWorldLabsApiKeyFromEnv(): string {
  return getApiKeyFromEnv('WORLDLABS_API_KEY')
}

export function resolveWorldLabsApiKey(config?: WorldLabsClientConfig): string {
  return config?.apiKey ?? getWorldLabsApiKeyFromEnv()
}

export function resolveWorldLabsApiUrl(config?: WorldLabsClientConfig): string {
  return (config?.baseUrl ?? DEFAULT_WORLDLABS_API_URL).replace(/\/+$/, '')
}

export function createWorldLabsClient(config: WorldLabsClientConfig = {}): {
  client: Client
  apiKey: string
  baseUrl: string
} {
  const apiKey = resolveWorldLabsApiKey(config)
  const baseUrl = resolveWorldLabsApiUrl(config)
  const fetchImpl = config.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'global fetch is not available. Pass `fetch` in the World Labs adapter config.',
    )
  }

  const client = createClient(
    createConfig({
      baseUrl,
      auth: apiKey,
      fetch: fetchImpl,
      headers: config.defaultHeaders,
    }),
  )

  return { client, apiKey, baseUrl }
}
