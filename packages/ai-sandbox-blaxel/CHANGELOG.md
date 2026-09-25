# @tanstack/ai-sandbox-blaxel

## 0.3.1

### Patch Changes

- [#1484](https://github.com/TanStack/ai/pull/1484) [`61231d6`](https://github.com/TanStack/ai/commit/61231d61df2908ef14efd59801d8c0f9b82eb51b) - Add a package README to each sandbox provider: what it isolates with, the factory call, the auth and snapshot/resume behaviour that differs between them, and links to the sandbox docs.

## 0.3.0

### Minor Changes

- [#1358](https://github.com/TanStack/ai/pull/1358) [`a31109f`](https://github.com/TanStack/ai/commit/a31109f4573360c71525513ba7bf2e13fb44c00c) - Use SDK-resolved CLI or client credentials when no API key is supplied. Add lstat metadata without following symlinks and advertise process termination after live conformance validation, with bounded remote reaper completion.

### Patch Changes

- [#1356](https://github.com/TanStack/ai/pull/1356) [`63f5f49`](https://github.com/TanStack/ai/commit/63f5f49cd64ec722cdd0f05b560594be8b59d02b) - Preserve concurrent stdout and stderr when Blaxel log delivery splits records or inserts keepalives. Wait for log attachment before starting the command.

- Updated dependencies []:
  - @tanstack/ai-sandbox@0.5.15

## 0.2.0

### Minor Changes

- [#1065](https://github.com/TanStack/ai/pull/1065) [`c92223a`](https://github.com/TanStack/ai/commit/c92223adad5a5545c40d32734d9df26c62421d37) - Add `@tanstack/ai-sandbox-blaxel`, a sandbox provider backed by managed Blaxel
  sandboxes. It implements the `SandboxProvider` / `SandboxHandle`
  contract: native filesystem reads and writes, `fs.watch()` without polling,
  commands with separate stdout and stderr, live bounded background-process
  output, per-port preview URLs, `env` injection, and resume-by-id. Process stdout
  and stderr are byte-bounded through remotely supervised 8 MiB capture pipelines
  and sent live as fixed-size base64 records, preventing the pinned SDK from
  accumulating unbounded cumulative or newline-free logs while retaining exact
  bytes and the framework's line-stream contract.

  Blaxel's source-scoped snapshot/fork API is currently a private preview, has
  no entitlement probe, and does not document snapshots surviving source deletion.
  The provider therefore keeps the framework's `snapshots`, `fork`, and
  `restoreSnapshot` surface disabled rather than claiming reconstruct-after-delete
  semantics it cannot guarantee.

  Created sandboxes carry a `1h` TTL by default so an abandoned run cannot strand
  a paid sandbox; pass `ttl: null` to manage lifetime yourself. Previews are
  token-gated by default, and the returned channel reports both the token and the
  ready-to-send `X-Blaxel-Preview-Token` header.

  A spawned process reports termination honestly: if `kill()` cannot reap the
  remote process group, `wait()` rejects with that failure instead of resolving
  the kill exit code, so a sandbox that is still running and still billing cannot
  hide behind a clean exit. A stream that already failed is reported for the same
  reason. `fs.write()` creates missing parent directories, and `fork()` throws
  `UnsupportedCapabilityError` rather than being absent.

### Patch Changes

- Updated dependencies [[`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198)]:
  - @tanstack/ai-sandbox@0.5.7
