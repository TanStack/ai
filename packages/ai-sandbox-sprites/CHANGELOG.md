# @tanstack/ai-sandbox-sprites

## 0.2.1

### Patch Changes

- [#889](https://github.com/TanStack/ai/pull/889) [`9b58c08`](https://github.com/TanStack/ai/commit/9b58c08258dfb8dc261a0dd1954216cc5a75cc3e) - Give providers a deterministic sandbox id on create.

  `SandboxCreateInput` now carries an optional `id`, and `ensure()` passes the
  compound sandbox key into `provider.create()`. Providers whose native id is
  addressable by name **and** expose a preview URL keyed by that id — Cloudflare
  (DO id) and Sprites (sprite name) — honor it (`input.id ?? <random>`), so
  out-of-band consumers (e.g. attaching a preview iframe) can reconstruct the
  exact sandbox an agent is editing from run context instead of the random id
  previously recoverable only from the sandbox store. Providers that mint their
  own opaque id (Daytona, Vercel) ignore it, so behavior is unchanged for them.

- Updated dependencies [[`9b58c08`](https://github.com/TanStack/ai/commit/9b58c08258dfb8dc261a0dd1954216cc5a75cc3e)]:
  - @tanstack/ai-sandbox@0.2.1

## 0.2.0

### Minor Changes

- [#868](https://github.com/TanStack/ai/pull/868) [`c3bb4b9`](https://github.com/TanStack/ai/commit/c3bb4b9bdd79d3da599a5f77a874da421188eeff) - Add `@tanstack/ai-sandbox-sprites`: a Sprites (Fly.io) stateful sandbox provider implementing the `SandboxProvider` / `SandboxHandle` contract. Supports exec (with separate stdout/stderr), background processes, native filesystem I/O, exec-backed git, env injection, durable filesystem, resume-by-id, and checkpoints (`snapshot()` to create a save point; in-place `restoreCheckpoint()` / `listCheckpoints()` on the handle). `ports.connect()` exposes the Sprite's single proxied public-URL port. Dependency-free (REST + WebSocket); needs `SPRITES_API_KEY`.
