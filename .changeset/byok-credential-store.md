---
'@tanstack/ai': minor
---

BYOK keys can now live on the server. `@tanstack/ai/byok` exports the `CredentialStore` contract, the `Credential` and `CredentialScope` types, and `defineCredentialStore`. A `CredentialScope` has `tenantId` and `userId`. Its `threadId` is optional, and a store ignores it. `@tanstack/ai/byok/server` adds:

- `storedProviderKeys(store, scope)`: provider keys from the `api_key` credentials of a user, then of the tenant, then the provider's `env` names. Pass `keys.adapter(...)` to `chat()` and `keys.get` to `subagents.keys`.
- `readCredential(store, scope, id)`: one credential, the user's own first, then the tenant's. A user with no tenant reads only their own.
- `tenantScopeOf(scope)`: the tenant scope of a user scope, or `undefined` when the scope has no user or no tenant.
- `memoryCredentialStore()`: a store in memory, for development and tests.
- `envKeyEntry(provider)`: the first `provider.env` name that is set, with its value.
- `readCredentialEntry(store, scope, id)`: reads a credential like `readCredential`. It also tells you which scope had the credential (the user or the tenant), and gives its revision when the store has `getVersioned`.

`CredentialStore` has two optional methods for compare-and-set writes, `getVersioned` and `setIf`, with the same shape as the pair on `MetadataStore`. A store without them still works. `memoryCredentialStore` has both.

Keep the store in your own database or in a secrets manager, and encrypt the secrets at rest. An `oauth` credential can keep the OAuth `client` it was issued to. `list` never returns secret values.

`scrubSecrets` from `@tanstack/ai/byok` now also removes the JSON-escaped and URL-encoded forms of each secret. It skips a secret that is shorter than 6 characters, so a short value does not remove common words.

`Credential` has a new type, `secret_answer` (`{ value, expiresAt }`). The harness keeps a secret answer to a question there for a short time and deletes it once read. Leave this type out of a list of connected accounts. `memoryCredentialStore().list` returns its `expiresAt`.
