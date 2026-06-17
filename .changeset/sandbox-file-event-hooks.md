---
'@tanstack/ai-sandbox': minor
'@tanstack/ai-sandbox-local-process': minor
---

Sandbox file-event hooks: observe file create / change / delete inside a sandbox.

- **`@tanstack/ai-sandbox`** — `watchWorkspace(handle, { onEvent })` and the
  ergonomic `watchWithHooks(handle, { onCreate, onChange, onDelete })`
  building blocks emit typed `FileEvent`s. They're provider-agnostic: a native
  `fs.watch` fast-path is used when the provider advertises it, otherwise a
  portable `find -printf` mtime snapshot-diff poll runs (no extra deps, no image
  changes; `.git` / `node_modules` ignored by default). New
  `withSandboxFileEvents()` middleware surfaces those events into the `chat()`
  stream as CUSTOM `sandbox.file` events, interleaved with the agent's output,
  so any UI sees the agent's edits live. Exports `watchWorkspace`,
  `watchWithHooks`, `diffSnapshots`, `withSandboxFileEvents`,
  `SANDBOX_FILE_EVENT`, and the `FileEvent` / `FileEventType` / `WatchOptions` /
  `SandboxWatchHandle` / `SandboxHooks` / `SandboxFileEventsOptions` types.
- **`@tanstack/ai-sandbox-local-process`** — implements the optional
  `fs.watch` seam via Node's recursive `fs.watch` (Windows/macOS); Linux falls
  back to the core exec-poll automatically.
