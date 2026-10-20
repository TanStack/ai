import type {
  Credential,
  CredentialScope,
  CredentialStore,
} from './credentials'

/**
 * A {@link CredentialStore} in memory, for development and tests. The
 * credentials are lost when the process stops.
 */
export function memoryCredentialStore(): CredentialStore {
  const values = new Map<
    string,
    Map<string, { credential: Credential; revision: string }>
  >()
  // One counter for the whole store, so a key that is deleted and set again
  // never gets a revision that an earlier reader saw.
  let lastRevision = 0
  // A credential without a userId belongs to the tenant.
  const owner = (scope: CredentialScope) =>
    JSON.stringify([scope.tenantId ?? null, scope.userId ?? null])
  const write = (
    scope: CredentialScope,
    id: string,
    credential: Credential,
  ) => {
    const key = owner(scope)
    let bucket = values.get(key)
    if (!bucket) {
      bucket = new Map()
      values.set(key, bucket)
    }
    const revision = String(++lastRevision)
    bucket.set(id, { credential: structuredClone(credential), revision })
    return revision
  }
  return {
    get: ({ scope, id }) => {
      const stored = values.get(owner(scope))?.get(id)
      return Promise.resolve(stored ? structuredClone(stored.credential) : null)
    },
    getVersioned: ({ scope, id }) => {
      const stored = values.get(owner(scope))?.get(id)
      return Promise.resolve(stored ? structuredClone(stored) : null)
    },
    set: ({ scope, id, credential }) => {
      write(scope, id, credential)
      return Promise.resolve()
    },
    setIf: ({ scope, id, credential, expectedRevision }) => {
      const current = values.get(owner(scope))?.get(id)?.revision ?? null
      if (current !== expectedRevision) {
        return Promise.resolve({ ok: false, reason: 'conflict' } as const)
      }
      return Promise.resolve({
        ok: true,
        revision: write(scope, id, credential),
      } as const)
    },
    delete: ({ scope, id }) => {
      values.get(owner(scope))?.delete(id)
      return Promise.resolve()
    },
    list: (scope) =>
      Promise.resolve(
        [...(values.get(owner(scope))?.entries() ?? [])].map(
          ([id, { credential }]) => ({
            id,
            type: credential.type,
            ...(credential.type !== 'api_key' &&
            credential.expiresAt !== undefined
              ? { expiresAt: credential.expiresAt }
              : {}),
          }),
        ),
      ),
  }
}
