import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { Ai, GatewayOptions } from '@cloudflare/workers-types'
import type { ClientOptions } from 'openai'

/**
 * AI Gateway routing options. `id` is the gateway id (use `"default"` for the
 * account's auto-created gateway). The remaining fields are per-request
 * gateway controls (cache, logging, retries) and map to `cf-aig-*` headers on
 * the REST path or to the `gateway` run option on the binding path.
 */
export type CloudflareGatewayOptions = GatewayOptions

export type FetchLike = NonNullable<ClientOptions['fetch']>

/**
 * Run through the Workers AI binding (`env.AI`) inside a Cloudflare Worker.
 * No API token is needed.
 */
export interface CloudflareBindingConfig {
  binding: Ai
  gateway?: CloudflareGatewayOptions
  accountId?: never
  apiKey?: never
}

/** Run through the Cloudflare REST API from any runtime. */
export interface CloudflareRestConfig {
  accountId: string
  apiKey: string
  gateway?: CloudflareGatewayOptions
  /** Custom fetch for every request. */
  fetch?: FetchLike
  binding?: never
}

/**
 * REST config for the chat surface. Also accepts the OpenAI SDK client
 * options (`baseURL`, `defaultHeaders`, `timeout`, `maxRetries`, ...), which
 * only the text and summarize adapters read.
 */
export interface CloudflareTextRestConfig
  extends CloudflareRestConfig, Omit<ClientOptions, 'apiKey' | 'fetch'> {}

export type CloudflareConfig = CloudflareBindingConfig | CloudflareRestConfig

export type CloudflareTextConfig =
  | CloudflareBindingConfig
  | CloudflareTextRestConfig

/**
 * What the env-reading factories accept: a binding, or REST fields with any
 * missing ones read from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
 */
export type CloudflareConfigInput<
  TRest extends CloudflareRestConfig = CloudflareRestConfig,
> = CloudflareBindingConfig | Partial<TRest>

export const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

export function isBindingConfig(config: {
  binding?: Ai
}): config is CloudflareBindingConfig {
  return config.binding !== undefined
}

/** Base URL for the OpenAI-compatible chat surface of an account. */
export function restChatBaseURL(config: CloudflareTextRestConfig): string {
  return (
    config.baseURL ||
    `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/ai/v1`
  )
}

/**
 * Translates gateway options into the `cf-aig-*` request headers the REST
 * API reads. Retries are not mapped: set them on the gateway itself.
 */
export function gatewayHeaders(
  gateway: CloudflareGatewayOptions | undefined,
): Record<string, string> {
  if (!gateway) return {}
  const headers: Record<string, string> = { 'cf-aig-gateway-id': gateway.id }
  if (gateway.skipCache !== undefined) {
    headers['cf-aig-skip-cache'] = String(gateway.skipCache)
  }
  if (gateway.cacheTtl !== undefined) {
    headers['cf-aig-cache-ttl'] = String(gateway.cacheTtl)
  }
  if (gateway.cacheKey !== undefined) {
    headers['cf-aig-cache-key'] = gateway.cacheKey
  }
  if (gateway.collectLog !== undefined) {
    headers['cf-aig-collect-log'] = String(gateway.collectLog)
  }
  if (gateway.eventId !== undefined) {
    headers['cf-aig-event-id'] = gateway.eventId
  }
  if (gateway.requestTimeoutMs !== undefined) {
    headers['cf-aig-request-timeout'] = String(gateway.requestTimeoutMs)
  }
  if (gateway.metadata !== undefined) {
    headers['cf-aig-metadata'] = JSON.stringify(gateway.metadata)
  }
  return headers
}

/**
 * Resolves a config for the env-reading factories: a binding config passes
 * through, anything else is filled from `CLOUDFLARE_ACCOUNT_ID` and
 * `CLOUDFLARE_API_TOKEN`.
 */
export function resolveConfigFromEnv<TRest extends CloudflareRestConfig>(
  config: CloudflareConfigInput<TRest> | undefined,
): CloudflareBindingConfig | (Partial<TRest> & CloudflareRestConfig) {
  if (config && isBindingConfig(config)) return config
  const rest: Partial<TRest> = config ?? {}
  try {
    return {
      ...rest,
      accountId: rest.accountId ?? getApiKeyFromEnv('CLOUDFLARE_ACCOUNT_ID'),
      apiKey: rest.apiKey ?? getApiKeyFromEnv('CLOUDFLARE_API_TOKEN'),
    }
  } catch (cause) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required. Set them in your environment, pass { accountId, apiKey }, or pass { binding: env.AI } inside a Worker.',
      { cause },
    )
  }
}
