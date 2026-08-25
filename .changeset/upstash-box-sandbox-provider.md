---
'@tanstack/ai-sandbox-upstash-box': minor
---

Add `@tanstack/ai-sandbox-upstash-box`, an Upstash Box sandbox provider. Runs
harness adapters inside isolated Upstash Box cloud sandboxes through the uniform
`SandboxHandle` — a native filesystem (including `stat`-backed `exists`), shell
`exec` with separate stdout and stderr, background processes over Box's live
`exec.session` (real in-box pid, writable stdin, and `kill()` that signals the
process tree server-side), public preview URLs via `getPublicURL`, and native
snapshots (`box.snapshot()` / `Box.fromSnapshot()`).

Requires `@upstash/box` 0.7.1 or newer for `exec.session` and the filesystem
metadata operations.
