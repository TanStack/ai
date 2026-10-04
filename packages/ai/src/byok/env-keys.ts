import { envKey } from './get-key'
import { isKeyedAdapter } from './keyed'
import type { ByokProvider } from './define-provider'
import type { ProviderKeys } from './keyed'
import type { ProviderId } from './providers'

function missingKeyMessage(provider: ByokProvider | ProviderId) {
  if (typeof provider === 'string') return `Missing ${provider} API key.`
  const names = provider.env ?? []
  const hint = names.length > 0 ? ` Set ${names.join(' or ')}.` : ''
  return `Missing ${provider.label} API key.${hint}`
}

async function requireEnvKey(provider: ByokProvider | ProviderId) {
  const key = envKey(provider)
  if (key === null) throw new Error(missingKeyMessage(provider))
  return key
}

/**
 * The `ctx.keys` of an agent whose host sets no keys: each provider's `env`
 * names. Not in `@tanstack/ai/byok`, so the client entry has no env access.
 */
export const envProviderKeys: ProviderKeys = {
  get: async (provider) => envKey(provider),
  require: requireEnvKey,
  adapter: async (adapter) =>
    isKeyedAdapter(adapter)
      ? adapter.create(await requireEnvKey(adapter.provider))
      : adapter,
}
