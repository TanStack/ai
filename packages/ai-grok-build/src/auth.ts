/** ACP auth methods advertised by `grok agent` (see harness `initialize`). */
export type GrokBuildAcpAuthMethod = 'xai.api_key' | 'grok.com'

export type GrokBuildAuthMode = 'host' | 'api-key'

/** Isolated sandboxes have no host CLI login, so this is the default. */
const DEFAULT_GROK_AUTH_MODE: GrokBuildAuthMode = 'api-key'

export function resolveGrokAcpAuthMethod(
  env?: Record<string, string | undefined>,
): GrokBuildAcpAuthMethod | undefined {
  const key =
    env?.XAI_API_KEY ??
    env?.GROK_API_KEY ??
    process.env.XAI_API_KEY ??
    process.env.GROK_API_KEY
  return key ? 'xai.api_key' : undefined
}

export function resolveGrokSessionAuthMethod(
  authMode: GrokBuildAuthMode | undefined,
  explicitId: string | undefined,
  env?: Record<string, string | undefined>,
): string | undefined {
  if (explicitId !== undefined) return explicitId
  const mode = authMode ?? DEFAULT_GROK_AUTH_MODE
  if (mode === 'api-key') {
    return resolveGrokAcpAuthMethod(env) ?? 'xai.api_key'
  }
  return undefined
}

/** Prefer ACP `RequestError.data` over the generic `Internal error` message. */
export function formatAcpRequestError(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'data' in error) {
    const data = error.data
    if (typeof data === 'string' && data.trim() !== '') return data.trim()
  }
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message
  }
  return 'Unknown error occurred'
}
