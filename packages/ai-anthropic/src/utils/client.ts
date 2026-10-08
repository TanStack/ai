import Anthropic_SDK from '@anthropic-ai/sdk'
import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from '@anthropic-ai/sdk'

export interface AnthropicClientConfig extends ClientOptions {
  apiKey?: string | null
}

/** Resolve explicit credentials before the environment credentials. */
export function resolveAnthropicCredentials(
  config: AnthropicClientConfig,
  oauthOverride?: boolean,
) {
  const env = typeof process === 'undefined' ? {} : process.env
  const explicit = Boolean(config.authToken || config.apiKey)
  const environmentToken = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_OAUTH_TOKEN
  const credential = explicit
    ? config.authToken || config.apiKey
    : environmentToken || env.ANTHROPIC_API_KEY
  if (!credential) getAnthropicApiKeyFromEnv()
  const detectedOAuth = Boolean(
    credential?.includes('sk-ant-oat') ||
    (!explicit && !env.ANTHROPIC_AUTH_TOKEN && env.ANTHROPIC_OAUTH_TOKEN),
  )
  const oauth = oauthOverride ?? detectedOAuth
  const token = Boolean(
    config.authToken ||
    (!explicit && environmentToken) ||
    detectedOAuth ||
    oauth,
  )
  return {
    apiKey: token ? null : credential,
    authToken: token ? credential : null,
    oauth,
  }
}

type AnyAnthropicMessagesCreate = (
  params: never,
  ...args: Array<never>
) => unknown

/**
 * The minimal Anthropic client surface used by the text adapter.
 *
 * The callable is intentionally type-erased because alternative Anthropic
 * clients can depend on a different 0.x release of the Anthropic SDK. Their
 * request and response declarations may drift even when the runtime Messages
 * protocol remains compatible.
 */
export interface AnthropicMessagesClient {
  readonly beta: {
    readonly messages: {
      readonly create: AnyAnthropicMessagesCreate
    }
  }
}

/**
 * Creates an Anthropic SDK client instance
 */
export function createAnthropicClient(
  config: AnthropicClientConfig,
  oauthOverride?: boolean,
) {
  const credentials = resolveAnthropicCredentials(config, oauthOverride)
  return new Anthropic_SDK({
    ...config,
    apiKey: credentials.apiKey,
    authToken: credentials.authToken,
    ...(credentials.authToken && {
      defaultHeaders: { ...config.defaultHeaders, 'x-api-key': null },
    }),
  })
}

/**
 * Gets Anthropic API key from environment variables
 * @throws Error if ANTHROPIC_API_KEY is not found
 */
export function getAnthropicApiKeyFromEnv(): string {
  return getApiKeyFromEnv('ANTHROPIC_API_KEY')
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  return _generateId(prefix)
}
