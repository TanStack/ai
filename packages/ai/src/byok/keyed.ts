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
