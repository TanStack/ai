import { providerKeys } from './env-keys'
import { resolveProviderId } from './providers'
import type {
  Credential,
  CredentialScope,
  CredentialStore,
} from './credentials'
import type { ProviderKeys } from './keyed'

/**
 * The tenant scope of a user scope: the same tenant, no user. `undefined` for
 * a scope with no user or no tenant, so a user without a tenant never reads
 * the bucket shared by every scope with neither.
 */
export function tenantScopeOf({
  userId,
  tenantId,
}: CredentialScope): CredentialScope | undefined {
  return userId === undefined || tenantId === undefined
    ? undefined
    : { tenantId }
}

/**
 * The credential `id` of `scope`: the user's own first, then the tenant's
 * (saved without a `userId`). A save or a delete changes the user's own only.
 */
export async function readCredential(
  store: CredentialStore,
  scope: CredentialScope,
  id: string,
): Promise<Credential | null> {
  return (await readCredentialEntry(store, scope, id))?.credential ?? null
}

/**
 * Like {@link readCredential}, but also gives the scope where the credential
 * was found (`scope` itself, or its tenant scope) and its `revision` when the
 * store has `getVersioned`. Write a refreshed credential back to that scope,
 * with `setIf` and that revision.
 */
export async function readCredentialEntry(
  store: CredentialStore,
  scope: CredentialScope,
  id: string,
): Promise<{
  credential: Credential
  scope: CredentialScope
  revision?: string
} | null> {
  const tenant = tenantScopeOf(scope)
  for (const candidate of tenant ? [scope, tenant] : [scope]) {
    if (store.getVersioned) {
      const found = await store.getVersioned({ scope: candidate, id })
      if (found) return { ...found, scope: candidate }
    } else {
      const credential = await store.get({ scope: candidate, id })
      if (credential) return { credential, scope: candidate }
    }
  }
  return null
}

/**
 * Provider keys saved on the server: the `api_key` credential stored under
 * the provider id for `scope` (the user's, else the tenant's), else the
 * provider's `env` names.
 *
 * @example
 * ```ts
 * const gpt = keyedAdapter(openaiByok, (key) =>
 *   createOpenaiChat('gpt-6.1-sol', key),
 * )
 * const keys = storedProviderKeys(credentials, { userId, tenantId })
 * chat({
 *   adapter: await keys.adapter(gpt),
 *   subagents: { agents, keys: keys.get },
 * })
 * ```
 */
export function storedProviderKeys(
  store: CredentialStore,
  scope: CredentialScope,
): ProviderKeys {
  return providerKeys(async (provider) => {
    const saved = await readCredential(
      store,
      scope,
      resolveProviderId(provider),
    )
    return saved?.type === 'api_key' ? saved.value : null
  })
}
