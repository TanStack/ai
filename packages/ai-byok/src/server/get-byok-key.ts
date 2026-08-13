import { byokHeaderName } from '../shared/providers'
import type { ProviderId } from '../shared/providers'

/**
 * Reads a provider's BYOK key off the incoming request header.
 *
 * Returns the key or `null` if absent. The key is read from the header only —
 * never the body — so it stays out of any persisted `messages` array and out
 * of the event/observability stream. This function does not log the value and
 * must not be wrapped in anything that attaches it to a logger context.
 *
 * Accepts either a `Request` or any object exposing a `Headers`-like `get`, so
 * it works across Fetch-API runtimes (Workers, Deno, Bun, Node/undici).
 */
export function getByokKey(
  request: { headers: Pick<Headers, 'get'> },
  provider: ProviderId,
): string | null {
  const value = request.headers.get(byokHeaderName(provider))
  return value && value.length > 0 ? value : null
}

/**
 * Header key if present, otherwise the first non-empty named env var.
 * Returns `null` when neither is set — callers should `return byokMissing(provider)`.
 */
export function getByokOrEnvKey(
  request: { headers: Pick<Headers, 'get'> },
  provider: ProviderId,
  envVarNames: ReadonlyArray<string>,
): string | null {
  const header = getByokKey(request, provider)
  if (header) return header
  for (const name of envVarNames) {
    const value = process.env[name]
    if (value) return value
  }
  return null
}
