---
'@tanstack/ai': minor
'@tanstack/ai-sandbox': minor
'@tanstack/ai-sandbox-local-process': minor
---

Declarative sandbox file-event hooks: observe file create / change / delete
inside a sandbox and have them fire automatically during a chat run.

- `@tanstack/ai`: chat middleware gains an optional `sandbox` hook group
  (`onFile`/`onFileCreate`/`onFileChange`/`onFileDelete`), a `SandboxFileEvent`
  type, and a `sandbox` debug-logging category. The engine auto-emits a
  `CUSTOM` `sandbox.file` event per change (client reads it from `parts`).
- `@tanstack/ai-sandbox`: `defineSandbox({ hooks, fileEvents })` declares
  file + lifecycle hooks (`onFile*`/`onReady`/`onError`/`onDestroy`) that fire
  automatically while the sandbox runs in a chat — `withSandbox` owns the
  watcher. The watcher is provider-agnostic: a native `fs.watch` fast-path when
  the provider advertises it, otherwise a portable `find -printf` mtime
  snapshot-diff poll (no extra deps; `.git`/`node_modules` ignored by default).
  `watchWorkspace()` / `diffSnapshots` remain as low-level building blocks.
- `@tanstack/ai-sandbox-local-process`: implements the optional `fs.watch` seam
  via Node's recursive `fs.watch` (Windows/macOS); Linux falls back to the core
  exec-poll automatically.
