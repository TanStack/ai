import { byokHeaderName, resolveProviderId } from './providers'
import type { KeyedAdapter, KeyedAdapterResult } from './keyed'
import type { ByokProvider } from './define-provider'
import type { ProviderId } from './providers'

/**
 * The first name in `provider.env` that is set, with its value. A slug has no
 * env names. Where `process` is missing (a browser) it returns `null`.
 */
export function envKeyEntry(provider: ProviderId | ByokProvider) {
  if (typeof provider === 'string') return null
  const env = globalThis.process?.env
  for (const name of provider.env ?? []) {
    const value = env?.[name]
    if (typeof value === 'string' && value.length > 0) return { name, value }
  }
  return null
}

/** The value of {@link envKeyEntry}, or `null`. */
export function envKey(provider: ProviderId | ByokProvider) {
  return envKeyEntry(provider)?.value ?? null
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
): string | null {
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
>(
  request: Request,
  providers: TProviders,
): { [K in keyof TProviders]: string | null } {
  return Object.fromEntries(
    Object.entries(providers).map(([name, provider]) => [
      name,
      getByokKey(request, provider),
    ]),
  ) as { [K in keyof TProviders]: string | null }
}

/**
 * Build the adapter of the first provider that has a key. The user's own key
 * (the `x-byok-<id>` header) wins, in order. Then each keyed adapter made with
 * a BYOK descriptor tries its `env` names, in order. Gives `null` when no
 * provider has a key, so the route can answer with `byokMissing`.
 *
 * @example
 * ```ts
 * const adapter = keyedAdapterFromRequest(request, models)
 * if (!adapter) return byokMissing('openai')
 * return toServerSentEventsResponse(chat({ adapter, messages }))
 * ```
 */
export function keyedAdapterFromRequest<
  const T extends
    | Record<string, KeyedAdapter<unknown>>
    | ReadonlyArray<KeyedAdapter<unknown>>,
>(
  request: Request,
  adapters: T,
): KeyedAdapterResult<
  T extends ReadonlyArray<unknown> ? T[number] : T[keyof T]
> | null {
  const list: ReadonlyArray<KeyedAdapter<unknown>> = Object.values(adapters)
  // A slug reads only the header, so the first pass finds the user's own key.
  for (const keyed of list) {
    const key = getByokKey(request, resolveProviderId(keyed.provider))
    if (key) return keyed.create(key) as never
  }
  for (const keyed of list) {
    const key = getByokKey(request, keyed.provider)
    if (key) return keyed.create(key) as never
  }
  return null
}
