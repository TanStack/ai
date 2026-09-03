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
 * Gateway endpoints mirror each vendor's own path after the host, and most
 * vendor SDKs already append their version segment (Anthropic `/v1/messages`,
 * Mistral `/v1/...`, Cohere `/v1/chat`). OpenAI-style SDKs append only
 * `/chat/completions`, which matches Cloudflare's `openai`, `groq`,
 * `perplexity-ai`, `deepseek`, and `cerebras` endpoints. xAI is the exception:
 * Cloudflare serves it at `/grok/v1/...`, so its base URL keeps the `/v1`.
 */
const PROVIDER_PATH_SUFFIX: Record<string, string> = { grok: '/v1' }

/**
 * Builds the `baseURL` and headers that point any provider adapter at that
 * provider's endpoint on your AI Gateway. Pass them through the adapter's
 * client options (`baseURL` + `defaultHeaders` for OpenAI-style SDKs).
 *
 * The headers carry the per-request `cf-aig-*` options plus
 * `cf-aig-authorization: Bearer <cfApiKey>` when `cfApiKey` is set. The
 * gateway id lives in the URL, so no `cf-aig-gateway-id` header is sent.
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
    baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/${provider}${PROVIDER_PATH_SUFFIX[provider] ?? ''}`,
    headers,
  }
}
