---
'@tanstack/ai-byok': minor
---

Add `@tanstack/ai-byok`: a bring-your-own-key toolkit for TanStack AI. Keys live client-side and travel to the relay in a per-provider header (`x-tanstack-byok-<provider>`), never the request body or message history.

- **Client** (`@tanstack/ai-byok`): `byokHeaders`, a typed provider registry, pluggable storage (memory by default, opt-in plaintext localStorage), and `validateKey`.
- **React** (`@tanstack/ai-byok/react`): `<ByokProvider storage={…}>`, `useByok()`, and a drop-in `<ByokKeyManager>` settings UI that only ever shows the last 4 characters of a saved key.
- **Server** (`@tanstack/ai-byok/server`): `getByokKey` (header-only, never logged), `byokMissing` (typed error response), and `scrubSecrets`/`maskKey` for keeping key material out of logs and errors. Stateless pass-through — no persistence, no central endpoint.
