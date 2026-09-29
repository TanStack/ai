import { byokHeaderName, resolveProviderId } from './providers'
import type { ByokProvider } from './define-provider'
import type { ProviderId } from './providers'

/**
 * Read `provider.env` in order and return the first value that is set. A
 * slug has no env names. Where `process` is missing (a browser) it returns
 * `null`.
 */
export function envKey(provider: ProviderId | ByokProvider) {
  if (typeof provider === 'string') return null
  const env = globalThis.process?.env
  for (const name of provider.env ?? []) {
    const value = env?.[name]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/**
 * Read a key on the relay. Import from `@tanstack/ai/byok/server` so this
 * `process.env` access is not in the client graph.
 *
 * The header wins. A {@link ByokProvider} then tries `provider.env` in order.
 * A slug is header-only.
 */
export function getByokKey(
  request: Request,
  provider: ProviderId | ByokProvider,
) {
  const value = request.headers.get(byokHeaderName(resolveProviderId(provider)))
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return envKey(provider)
}

/**
 * Read several keys at once, one per name. Same rules as {@link getByokKey}
 * for each entry. Use it for a credential made of more than one value.
 */
export function getByokKeys<
  const TProviders extends Record<string, ProviderId | ByokProvider>,
>(request: Request, providers: TProviders) {
  return Object.fromEntries(
    Object.entries(providers).map(([name, provider]) => [
      name,
      getByokKey(request, provider),
    ]),
  ) as { [K in keyof TProviders]: string | null }
}
