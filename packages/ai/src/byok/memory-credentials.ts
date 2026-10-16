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
  const values = new Map<string, Map<string, Credential>>()
  // A credential without a userId belongs to the tenant.
  const owner = (scope: CredentialScope) =>
    JSON.stringify([scope.tenantId ?? null, scope.userId ?? null])
  return {
    get: ({ scope, id }) => {
      const stored = values.get(owner(scope))?.get(id)
      return Promise.resolve(stored ? structuredClone(stored) : null)
    },
    set: ({ scope, id, credential }) => {
      const key = owner(scope)
      let bucket = values.get(key)
      if (!bucket) {
        bucket = new Map()
        values.set(key, bucket)
      }
      bucket.set(id, structuredClone(credential))
      return Promise.resolve()
    },
    delete: ({ scope, id }) => {
      values.get(owner(scope))?.delete(id)
      return Promise.resolve()
    },
    list: (scope) =>
      Promise.resolve(
        [...(values.get(owner(scope))?.entries() ?? [])].map(
          ([id, credential]) => ({
            id,
            type: credential.type,
            ...(credential.type === 'oauth' &&
            credential.expiresAt !== undefined
              ? { expiresAt: credential.expiresAt }
              : {}),
          }),
        ),
      ),
  }
}
