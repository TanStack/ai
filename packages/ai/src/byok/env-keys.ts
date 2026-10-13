import { ByokMissingError } from './errors'
import { envKey } from './get-key'
import { isKeyedAdapter } from './keyed'
import { resolveProviderId } from './providers'
import type { ByokProvider } from './define-provider'
import type { ProviderKeys } from './keyed'
import type { ProviderId } from './providers'

function missingKeyMessage(provider: ByokProvider | ProviderId) {
  if (typeof provider === 'string') return `Missing ${provider} API key.`
  const names = provider.env ?? []
  const hint = names.length > 0 ? ` Set ${names.join(' or ')}.` : ''
  return `Missing ${provider.label} API key.${hint}`
}

/**
 * The `ctx.keys` of an agent: `keys` by provider id, else `fallback` (the
 * keys of a parent agent), else each provider's `env` names. Not in
 * `@tanstack/ai/byok`, so the client entry has no env access.
 */
export function providerKeys(
  keys: Readonly<Record<ProviderId, string | null | undefined>> = {},
  fallback?: ProviderKeys,
): ProviderKeys {
  const get = async (provider: ByokProvider | ProviderId) =>
    keys[resolveProviderId(provider)] ||
    (fallback ? await fallback.get(provider) : envKey(provider)) ||
    null
  const require = async (provider: ByokProvider | ProviderId) => {
    const key = await get(provider)
    if (!key) {
      const error = new ByokMissingError(resolveProviderId(provider))
      error.message = missingKeyMessage(provider)
      throw error
    }
    return key
  }
  return {
    get,
    require,
    adapter: async (adapter) =>
      isKeyedAdapter(adapter)
        ? adapter.create(await require(adapter.provider))
        : adapter,
  }
}

/** The `ctx.keys` of an agent with no keys set: each provider's `env` names. */
export const envProviderKeys = providerKeys()
