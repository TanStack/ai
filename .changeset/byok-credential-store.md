---
'@tanstack/ai': minor
---

BYOK keys can now live on the server. `@tanstack/ai/byok` exports the `CredentialStore` contract, the `Credential` and `CredentialScope` types, and `defineCredentialStore`. A `CredentialScope` has `tenantId` and `userId`. Its `threadId` is optional, and a store ignores it. `@tanstack/ai/byok/server` adds:

- `storedProviderKeys(store, scope)`: provider keys from the `api_key` credentials of a user, then of the tenant, then the provider's `env` names. Pass `keys.adapter(...)` to `chat()` and `keys.get` to `subagents.keys`.
- `readCredential(store, scope, id)`: one credential, the user's own first, then the tenant's. A user with no tenant reads only their own.
- `tenantScopeOf(scope)`: the tenant scope of a user scope, or `undefined` when the scope has no user or no tenant.
- `memoryCredentialStore()`: a store in memory, for development and tests.
- `envKeyEntry(provider)`: the first `provider.env` name that is set, with its value.

Keep the store in your own database or in a secrets manager, and encrypt the secrets at rest. An `oauth` credential can keep the OAuth `client` it was issued to. `list` never returns secret values.
