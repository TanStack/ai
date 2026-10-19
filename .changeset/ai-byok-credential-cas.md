---
'@tanstack/ai': minor
---

`CredentialStore` can now do compare-and-set writes. It has two new optional methods, `getVersioned` and `setIf`, with the same shape as the pair on `MetadataStore`. A store without them still works. `memoryCredentialStore` has both.

The new `readCredentialEntry` in `@tanstack/ai/byok/server` reads a credential like `readCredential`. It also tells you which scope had the credential (the user or the tenant) and gives its revision when the store has `getVersioned`.

`scrubSecrets` from `@tanstack/ai/byok` now also removes the JSON-escaped and URL-encoded forms of each secret. It skips a secret that is shorter than 6 characters, so a short value does not remove common words.

`Credential` has a new type, `secret_answer` (`{ value, expiresAt }`). The harness keeps a secret answer to a question there for a short time and deletes it once read. Leave this type out of a list of connected accounts. `memoryCredentialStore().list` returns its `expiresAt`.
