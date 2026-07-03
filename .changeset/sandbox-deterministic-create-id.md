---
'@tanstack/ai-sandbox': patch
'@tanstack/ai-sandbox-cloudflare': patch
'@tanstack/ai-sandbox-sprites': patch
---

Give providers a deterministic sandbox id on create.

`SandboxCreateInput` now carries an optional `id`, and `ensure()` passes the
compound sandbox key into `provider.create()`. Providers whose native id is
addressable by name **and** expose a preview URL keyed by that id — Cloudflare
(DO id) and Sprites (sprite name) — honor it (`input.id ?? <random>`), so
out-of-band consumers (e.g. attaching a preview iframe) can reconstruct the
exact sandbox an agent is editing from run context instead of the random id
previously recoverable only from the sandbox store. Providers that mint their
own opaque id (Daytona, Vercel) ignore it, so behavior is unchanged for them.
