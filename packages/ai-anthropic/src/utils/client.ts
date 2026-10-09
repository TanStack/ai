import Anthropic_SDK from '@anthropic-ai/sdk'
import { generateId as _generateId } from '@tanstack/ai-utils'
import type { ClientOptions } from '@anthropic-ai/sdk'

/**
 * How the adapter sends the credential.
 * - `'api-key'`: the `x-api-key` header.
 * - `'bearer'`: `Authorization: Bearer`, and no `x-api-key`.
 * - `'oauth'`: the same as `'bearer'`, plus the Claude Code identity that a
 *   Claude OAuth token needs.
 */
export type AnthropicAuth = 'api-key' | 'bearer' | 'oauth'

export interface AnthropicClientConfig extends Omit<
  ClientOptions,
  'apiKey' | 'authToken'
> {
  apiKey: string
  /**
   * How to send `apiKey`. The default is `'oauth'` when the credential
   * contains `sk-ant-oat`, else `'api-key'`.
   */
  auth?: AnthropicAuth
}

/** The explicit `auth`, else the kind that the credential shows. */
export function resolveAnthropicAuth(
  config: Pick<AnthropicClientConfig, 'apiKey' | 'auth'>,
): AnthropicAuth {
  return (
    config.auth ?? (config.apiKey.includes('sk-ant-oat') ? 'oauth' : 'api-key')
  )
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
 * Creates an Anthropic SDK client instance. It reads no credential from the
 * environment.
 */
export function createAnthropicClient(
  config: AnthropicClientConfig,
): Anthropic_SDK {
  const { auth: _auth, apiKey, ...options } = config
  const token = resolveAnthropicAuth(config) !== 'api-key'
  // Explicit nulls stop the SDK from reading `ANTHROPIC_API_KEY` and
  // `ANTHROPIC_AUTH_TOKEN` on its own.
  return new Anthropic_SDK({
    ...options,
    apiKey: token ? null : apiKey,
    authToken: token ? apiKey : null,
    ...(token && {
      defaultHeaders: { ...options.defaultHeaders, 'x-api-key': null },
    }),
  })
}

/**
 * Reads the credential from the environment (`window.env` or
 * `process.env`), in this order:
 * 1. `ANTHROPIC_AUTH_TOKEN`: `'bearer'`, or `'oauth'` for an `sk-ant-oat` token.
 * 2. `ANTHROPIC_OAUTH_TOKEN`: `'oauth'`.
 * 3. `ANTHROPIC_API_KEY`: `'api-key'`.
 * @throws Error if none of them is set
 */
export function getAnthropicCredentialFromEnv(): {
  credential: string
  auth: AnthropicAuth
} {
  const { window: browser } = globalThis as {
    window?: { env?: Record<string, string | undefined> }
  }
  const env =
    browser?.env ?? (typeof process === 'undefined' ? undefined : process.env)
  const authToken = env?.ANTHROPIC_AUTH_TOKEN
  if (authToken) {
    return {
      credential: authToken,
      auth: authToken.includes('sk-ant-oat') ? 'oauth' : 'bearer',
    }
  }
  if (env?.ANTHROPIC_OAUTH_TOKEN) {
    return { credential: env.ANTHROPIC_OAUTH_TOKEN, auth: 'oauth' }
  }
  if (env?.ANTHROPIC_API_KEY) {
    return { credential: env.ANTHROPIC_API_KEY, auth: 'api-key' }
  }
  throw new Error(
    'ANTHROPIC_AUTH_TOKEN, ANTHROPIC_OAUTH_TOKEN, and ANTHROPIC_API_KEY are not set. Please set one of these environment variables or pass the credential directly.',
  )
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  return _generateId(prefix)
}
