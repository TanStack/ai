---
'@tanstack/ai': minor
'@tanstack/ai-sandbox': minor
---

Declarative sandbox file-event hooks.

- `@tanstack/ai`: chat middleware gains an optional `sandbox` hook group
  (`onFile`/`onFileCreate`/`onFileChange`/`onFileDelete`), a `SandboxFileEvent`
  type, and a `sandbox` debug-logging category. The engine auto-emits a
  `CUSTOM` `sandbox.file` event per change (client reads it from `parts`).
- `@tanstack/ai-sandbox`: `defineSandbox({ hooks, fileEvents })` declares
  file + lifecycle hooks that fire automatically while the sandbox runs in a
  chat. Removes `withSandboxFileEvents()` and `watchWithHooks()`;
  `watchWorkspace()` remains as the low-level building block.
