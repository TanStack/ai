---
'@tanstack/ai-byok': minor
---

Add `@tanstack/ai-byok`: a bring-your-own-key toolkit for TanStack AI. Keys live client-side and travel to the relay in a per-provider header (`x-tanstack-byok-<provider>`), never the request body or message history.

- **Client** (`@tanstack/ai-byok`): `byokHeaders`, a typed provider registry, pluggable storage (session-only memory by default, opt-in passkey-encrypted persistence — WebAuthn PRF → HKDF → AES-256-GCM in IndexedDB, no plaintext option), and `validateKey`.
- **React** (`@tanstack/ai-byok/react`): `<ByokProvider storage={…}>`, `useByok()` (with `locked`/`unlock` for encrypted storage), and a drop-in `<ByokKeyManager>` settings UI that only ever shows the last 4 characters of a saved key.
- **Server** (`@tanstack/ai-byok/server`): `getByokKey` (header-only, never logged), `byokMissing` (typed error response), and `scrubSecrets`/`maskKey` for keeping key material out of logs and errors. Stateless pass-through — no persistence, no central endpoint.
