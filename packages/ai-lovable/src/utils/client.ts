import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export const LOVABLE_DEFAULT_BASE_URL = 'https://ai.gateway.lovable.dev/v1'

export interface LovableClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

export function getLovableApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('LOVABLE_API_KEY')
  } catch (cause) {
    throw new Error(
      'LOVABLE_API_KEY is required. Set it in the environment or pass apiKey to the factory.',
      { cause },
    )
  }
}

export function lovableGatewayHeaders(apiKey: string): {
  'Lovable-API-Key': string
  'X-Lovable-AIG-SDK': string
} {
  return {
    'Lovable-API-Key': apiKey,
    'X-Lovable-AIG-SDK': 'tanstack-ai',
  }
}

export function withLovableDefaults(
  config: LovableClientConfig,
): ClientOptions {
  const { defaultHeaders, ...rest } = config
  return {
    ...rest,
    baseURL: config.baseURL || LOVABLE_DEFAULT_BASE_URL,
    defaultHeaders: {
      ...lovableGatewayHeaders(config.apiKey),
      ...defaultHeaders,
    },
  }
}

export function openaiRequestOptions(
  abortSignal?: AbortSignal,
): { signal: AbortSignal } | undefined {
  if (!abortSignal) return undefined
  return { signal: abortSignal }
}
