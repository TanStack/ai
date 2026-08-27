# @tanstack/ai-sandbox-upstash-box

## 0.2.0

### Minor Changes

- [#899](https://github.com/TanStack/ai/pull/899) [`8498be8`](https://github.com/TanStack/ai/commit/8498be8a6a2c805abdd778f07ed29d3d04ce429b) - Add `@tanstack/ai-sandbox-upstash-box`, an Upstash Box sandbox provider. Runs
  harness adapters inside isolated Upstash Box cloud sandboxes through the uniform
  `SandboxHandle` — a native filesystem (including `stat`-backed `exists`), shell
  `exec` with separate stdout and stderr, background processes over Box's live
  `exec.session` (real in-box pid, writable stdin, and `kill()` that signals the
  process tree server-side), public preview URLs via `getPublicURL`, and native
  snapshots (`box.snapshot()` / `Box.fromSnapshot()`), `fork()` built on the same
  snapshot pair, and a `deny` network policy mapped onto Box's `deny-all` egress
  mode.

  Requires `@upstash/box` 0.7.1 or newer for `exec.session` and the filesystem
  metadata operations.

### Patch Changes

- Updated dependencies [[`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b)]:
  - @tanstack/ai-sandbox@0.5.3
