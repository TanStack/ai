import { gatewayHeaders } from './utils/config'
import type { AIGatewayProviders } from '@cloudflare/workers-types'
import type { CloudflareGatewayOptions } from './utils/config'

export interface CloudflareGatewayTarget extends Omit<
  CloudflareGatewayOptions,
  'id'
> {
  accountId: string
  gatewayId: string
  /** Cloudflare API token, needed when the gateway has authentication on. */
  cfApiKey?: string
}

/**
 * Builds the `baseURL` and headers that point any provider adapter at that
 * provider's endpoint on your AI Gateway. Pass them through the adapter's
 * client options (`baseURL` + `defaultHeaders` for OpenAI-style SDKs).
 *
 * @example
 * ```typescript
 * const gateway = cloudflareGateway('openai', { accountId, gatewayId: 'prod' })
 * const adapter = createOpenaiChat('gpt-5.5', process.env.OPENAI_API_KEY!, {
 *   baseURL: gateway.baseURL,
 *   defaultHeaders: gateway.headers,
 * })
 * ```
 */
export function cloudflareGateway(
  provider: AIGatewayProviders | 'compat' | (string & {}),
  target: CloudflareGatewayTarget,
): { baseURL: string; headers: Record<string, string> } {
  const { accountId, gatewayId, cfApiKey, ...options } = target
  const { 'cf-aig-gateway-id': _id, ...headers } = gatewayHeaders({
    id: gatewayId,
    ...options,
  })
  if (cfApiKey) headers['cf-aig-authorization'] = `Bearer ${cfApiKey}`
  return {
    baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/${provider}`,
    headers,
  }
}
