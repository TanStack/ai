import { isProviderId, resolveProviderId } from './providers'
import type { ByokProvider } from './define-provider'
import type { ProviderId } from './providers'

const KEYED_ADAPTER = Symbol.for('tanstack.ai.keyedAdapter')

/**
 * An adapter that needs a provider key before it exists. Make one with
 * {@link keyedAdapter}. A host finds the key and calls `create` just before a
 * call.
 */
export interface KeyedAdapter<TAdapter> {
  readonly [KEYED_ADAPTER]: true
  /** The provider whose key `create` needs. */
  readonly provider: ByokProvider | ProviderId
  /** Builds the adapter from the key. */
  readonly create: (key: string) => TAdapter
}

/**
 * Wrap an adapter factory that needs a provider key. The host finds the key
 * and calls `create` just before each call, so the key is not in your code
 * or in a `.env` file. Works for every adapter kind: text, image, speech,
 * audio, video, and the rest.
 *
 * @param provider - The provider whose key `create` needs: a BYOK descriptor
 *   such as `openaiByok` (its `env` names are the fallback), or a provider id.
 * @param create - Builds the adapter from the key.
 * @throws Error when the provider id is not a valid BYOK slug.
 *
 * @example
 * ```ts
 * import { createOpenaiChat } from '@tanstack/ai-openai'
 * import { openaiByok } from '@tanstack/ai-openai/byok'
 *
 * const adapter = keyedAdapter(openaiByok, (key) =>
 *   createOpenaiChat('gpt-5.5', key),
 * )
 * // In a server route, with `getByokKey` from `@tanstack/ai/byok/server`:
 * const key = getByokKey(request, adapter.provider)
 * if (key) chat({ adapter: adapter.create(key), messages })
 * ```
 */
export function keyedAdapter<TAdapter>(
  provider: ByokProvider | ProviderId,
  create: (key: string) => TAdapter,
) {
  const id = resolveProviderId(provider)
  if (!isProviderId(id)) {
    throw new Error(`Invalid BYOK provider id: ${id}`)
  }
  const keyed: KeyedAdapter<TAdapter> = {
    [KEYED_ADAPTER]: true,
    provider,
    create,
  }
  return keyed
}

/**
 * True when `value` came from {@link keyedAdapter}. A host uses it to decide
 * if an adapter needs a key first.
 */
export function isKeyedAdapter<TAdapter>(
  value: TAdapter | KeyedAdapter<TAdapter>,
): value is KeyedAdapter<TAdapter> {
  return typeof value === 'object' && value !== null && KEYED_ADAPTER in value
}

/** The adapter type that a {@link KeyedAdapter} builds. */
export type KeyedAdapterResult<T> = T extends KeyedAdapter<infer A> ? A : never

/**
 * Keyed adapters for several providers in one map. The map key is the
 * provider id, so a key goes only to the factory of its own provider. An
 * entry is a factory (the key comes only from the `x-byok-<id>` header), or a
 * {@link keyedAdapter} made with a BYOK descriptor (its `env` names are the
 * fallback). Pick one per request with `keyedAdapterFromRequest` from
 * `@tanstack/ai/byok/server`.
 *
 * @throws Error when a key is not a valid provider id, or when a keyed adapter
 *   entry is for a different provider than its key.
 *
 * @example
 * ```ts
 * const models = keyedAdapters({
 *   openai: (key) => createOpenaiChat('gpt-6.1-sol', key),
 *   anthropic: keyedAdapter(anthropicByok, (key) =>
 *     createAnthropicChat('claude-sonnet-5-5', key),
 *   ),
 * })
 * ```
 */
export function keyedAdapters<
  const TMap extends Record<
    ProviderId,
    KeyedAdapter<unknown> | ((key: string) => unknown)
  >,
>(
  map: TMap,
): {
  [K in keyof TMap]: TMap[K] extends KeyedAdapter<infer A>
    ? KeyedAdapter<A>
    : TMap[K] extends (key: string) => infer A
      ? KeyedAdapter<A>
      : never
} {
  const entries = Object.entries(map).map(([id, entry]) => {
    if (!isKeyedAdapter(entry)) return [id, keyedAdapter(id, entry)] as const
    const entryId = resolveProviderId(entry.provider)
    if (entryId !== id) {
      throw new Error(
        `keyedAdapters: the "${id}" entry is a keyed adapter for "${entryId}"`,
      )
    }
    return [id, entry] as const
  })
  return Object.fromEntries(entries) as {
    [K in keyof TMap]: TMap[K] extends KeyedAdapter<infer A>
      ? KeyedAdapter<A>
      : TMap[K] extends (key: string) => infer A
        ? KeyedAdapter<A>
        : never
  }
}
