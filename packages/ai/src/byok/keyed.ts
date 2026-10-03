import { isProviderId, resolveProviderId } from './providers'
import type { ByokProvider } from './define-provider'
import type { ProviderId } from './providers'

const KEYED_ADAPTER = Symbol.for('tanstack.ai.keyedAdapter')

/**
 * An adapter that needs a provider key before it exists. Make one with
 * {@link keyedAdapter}. {@link ProviderKeys.adapter} builds it just before a
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
 * Finds provider keys for a run. An agent reads it as `ctx.keys`. A host, for
 * example a harness session, sets it on the binding and reads each user's
 * own keys. Without a host, `ctx.keys` reads each provider's `env` names.
 */
export interface ProviderKeys {
  /** The key for `provider`, or `null` when there is none. */
  get: (provider: ByokProvider | ProviderId) => Promise<string | null>
  /** The key for `provider`. Throws when there is none. */
  require: (provider: ByokProvider | ProviderId) => Promise<string>
  /**
   * The adapter to call. A plain adapter comes back unchanged. A
   * {@link KeyedAdapter} is built with the key from `require`.
   */
  adapter: <TAdapter>(
    adapter: TAdapter | KeyedAdapter<TAdapter>,
  ) => Promise<TAdapter>
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
 * // In an agent: chat({ adapter: await ctx.keys.adapter(adapter), ... })
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
