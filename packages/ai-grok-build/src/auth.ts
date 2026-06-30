/** ACP auth methods advertised by `grok agent` (see harness `initialize`). */
export type GrokBuildAcpAuthMethod = 'xai.api_key' | 'grok.com'

/**
 * Pick the Grok ACP auth method for {@link startAcpSession}.
 *
 * Sandboxed runs inject `XAI_API_KEY`; local runs may use `grok login` instead.
 */
export function resolveGrokAcpAuthMethod(
  env?: Record<string, string | undefined>,
): GrokBuildAcpAuthMethod {
  const key =
    env?.XAI_API_KEY ??
    env?.GROK_API_KEY ??
    process.env.XAI_API_KEY ??
    process.env.GROK_API_KEY
  return key ? 'xai.api_key' : 'grok.com'
}