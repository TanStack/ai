import { cloudflareGateway } from '@tanstack/ai-cloudflare'

/**
 * Client options that send a provider's calls through your Cloudflare AI
 * Gateway. Returns `{}` unless `CLOUDFLARE_ACCOUNT_ID` and
 * `CLOUDFLARE_AI_GATEWAY_ID` are set, so the adapters keep their default
 * endpoints otherwise.
 */
export function viaCloudflareGateway(
  provider: 'openai' | 'anthropic' | 'groq',
): { baseURL?: string; defaultHeaders?: Record<string, string> } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const gatewayId = process.env.CLOUDFLARE_AI_GATEWAY_ID
  if (!accountId || !gatewayId) return {}
  const gateway = cloudflareGateway(provider, {
    accountId,
    gatewayId,
    cfApiKey: process.env.CLOUDFLARE_API_TOKEN,
  })
  return { baseURL: gateway.baseURL, defaultHeaders: gateway.headers }
}
