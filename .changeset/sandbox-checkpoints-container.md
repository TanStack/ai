---
'@tanstack/ai-sandbox': minor
'@tanstack/ai-sandbox-cloudflare': minor
---

Checkpoint a sandbox workspace at any time, and restore it after a crash.

- `@tanstack/ai-sandbox`:
  - New `captureSandboxCheckpoint`, `restoreSandboxCheckpoint` and `sweepSandboxBlobs`. They work on any `SandboxHandle`, also with `sandboxWorkspaceBackend`.
  - Snapshots now keep file permission bits (for example `+x` scripts) and symlinks. A link that points outside the workspace fails the capture. `exclude` now runs before this check, so an excluded path never fails a capture.
  - `withSandbox` with portable snapshots now also writes a checkpoint when a run fails or is aborted. This is best effort: a failed capture is logged and the run error stays.
  - New optional `deleteCheckpoints` on `SandboxCheckpointStore`, implemented by `InMemorySandboxCheckpointStore`, with conformance cases.
- `@tanstack/ai-sandbox-cloudflare`:
  - New `@tanstack/ai-sandbox-cloudflare/container` entry with `containerSandbox`. It works over a container that your Durable Object starts (`ctx.container` plus `Files` from `@cloudflare/sandbox` 1.x). It never starts or stops the container and sets no egress. Pass a `DirectoryBackup` to get native snapshots.
  - `@tanstack/ai-sandbox-local-process` is now an optional peer dependency.
