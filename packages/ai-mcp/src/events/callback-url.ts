import { MCPEventConfigError } from '../errors'

/**
 * Query parameter that routes a webhook to a local subscription key.
 *
 * @experimental
 */
export const MCP_EVENT_CALLBACK_KEY_PARAM = 'mcp_event_subscription'

const LOOPBACK = new Set(['127.0.0.1', '[::1]', '::1'])

/**
 * Validate a webhook callback URL.
 *
 * https is required. http is allowed only for `127.0.0.1` and `[::1]` when
 * `allowInsecureLocalhost` is set. Credentials, fragments, and an existing
 * `mcp_event_subscription` parameter are rejected.
 *
 * @experimental
 */
export function validateCallbackUrl(
  url: string,
  opts: { allowInsecureLocalhost?: boolean } = {},
): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new MCPEventConfigError('Callback URL is not a valid URL')
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new MCPEventConfigError('Callback URL must not include credentials')
  }
  if (parsed.hash !== '') {
    throw new MCPEventConfigError('Callback URL must not include a fragment')
  }
  if (parsed.searchParams.has(MCP_EVENT_CALLBACK_KEY_PARAM)) {
    throw new MCPEventConfigError(
      `Callback URL must not already include ${MCP_EVENT_CALLBACK_KEY_PARAM}`,
    )
  }
  if (parsed.protocol === 'https:') return parsed
  if (parsed.protocol !== 'http:') {
    throw new MCPEventConfigError('Callback URL must use https')
  }
  if (!opts.allowInsecureLocalhost || !LOOPBACK.has(parsed.hostname)) {
    throw new MCPEventConfigError(
      'http callback URLs are only allowed for 127.0.0.1 and [::1] when allowInsecureLocalhost is set',
    )
  }
  return parsed
}

/**
 * Append `mcp_event_subscription=<key>` to a validated callback URL.
 *
 * @experimental
 */
export function withCallbackKey(url: URL, key: string): string {
  const next = new URL(url.href)
  next.searchParams.set(MCP_EVENT_CALLBACK_KEY_PARAM, key)
  return next.href
}

/**
 * Read the subscription key from a callback URL.
 *
 * @experimental
 */
export function readCallbackKey(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    const value = parsed.searchParams.get(MCP_EVENT_CALLBACK_KEY_PARAM)
    return value === null || value.length === 0 ? undefined : value
  } catch {
    return undefined
  }
}
