import type { features } from '../harness'

// The names of the `providerKeys()` and `usage()` plugins: their state is in
// the view's `state.plugins`.
export const PROVIDER_KEYS = 'tanstack/provider-keys'
export const USAGE = 'tanstack/usage'

/** A model provider of `providerKeys()`, and where its key comes from. */
export interface ProviderKey {
  id: string
  label: string
  state: 'connected' | 'env' | 'missing'
}

function isProviderKey(value: unknown): value is ProviderKey {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'label' in value &&
    typeof value.label === 'string' &&
    'state' in value &&
    (value.state === 'connected' ||
      value.state === 'env' ||
      value.state === 'missing')
  )
}

/**
 * The providers in `saved`, the state of the provider-keys plugin.
 * `/connect` and `/disconnect` update it, so the screen shows the keys live.
 * Empty before the plugin reports.
 */
export function providerKeysIn(saved: unknown) {
  const isState =
    typeof saved === 'object' && saved !== null && 'providers' in saved
  if (!isState) return []
  const { providers } = saved
  return Array.isArray(providers) ? providers.filter(isProviderKey) : []
}

/**
 * Is `feature` on? A feature that needs a key follows the saved keys: any
 * one of its providers with a key turns it on. The rest stay as at startup.
 */
export function isOn(
  feature: (typeof features)[number],
  keys: ReadonlyArray<ProviderKey>,
) {
  const followsKeys = feature.providers.length > 0 && keys.length > 0
  if (!followsKeys) return feature.on
  return keys.some(
    (key) => feature.providers.includes(key.id) && key.state !== 'missing',
  )
}

/** The usage plugin state: a copy of `session.usage().total`. */
export interface Usage {
  /** Model calls: `calls` in the state. */
  turns: number
  promptTokens: number
  completionTokens: number
  contextTokens: number
}

/** The usage plugin state in `saved`, with 0 for anything it has not counted. */
export function usageIn(saved: unknown): Usage {
  const read = (key: string) => {
    if (typeof saved !== 'object' || saved === null || !(key in saved)) return 0
    const value: unknown = Reflect.get(saved, key)
    return typeof value === 'number' ? value : 0
  }
  return {
    turns: read('calls'),
    promptTokens: read('promptTokens'),
    completionTokens: read('completionTokens'),
    contextTokens: read('contextTokens'),
  }
}
