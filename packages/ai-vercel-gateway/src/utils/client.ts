import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export interface VercelGatewayClientConfig
  extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
  httpReferer?: string
  xTitle?: string
}

export function getVercelGatewayApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('AI_GATEWAY_API_KEY')
  } catch {
    try {
      return getApiKeyFromEnv('VERCEL_OIDC_TOKEN')
    } catch {
      throw new Error(
        'AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required. Set one in the environment or pass apiKey to the factory.',
      )
    }
  }
}

export function withVercelGatewayDefaults(
  config: VercelGatewayClientConfig,
): ClientOptions {
  const { httpReferer, xTitle, defaultHeaders, ...rest } = config
  return {
    ...rest,
    baseURL: config.baseURL || 'https://ai-gateway.vercel.sh/v1',
    defaultHeaders: {
      ...(httpReferer ? { 'http-referer': httpReferer } : {}),
      ...(xTitle ? { 'x-title': xTitle } : {}),
      ...defaultHeaders,
    },
  }
}
