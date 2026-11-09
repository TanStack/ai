---
'@tanstack/ai-sandbox-tangle': minor
---

Add `@tanstack/ai-sandbox-tangle`, a sandbox provider backed by Tangle cloud
sandboxes through `@tangle-network/sandbox`. It implements the
`SandboxProvider` / `SandboxHandle` contract: file reads and writes through the
sandbox file API, commands with separate stdout and stderr and real exit codes,
background processes with streamed output, public preview URLs through
`ports.connect`, `env` injection, and resume by id across stop.

`snapshot()` captures the workspace and `restoreSnapshot()` creates a new
sandbox from it. `fork()` branches the running sandbox into a new one.
`kill()` signals the process tree inside the sandbox, and an aborted `exec`
kills its process; both are measured against production. A
`network: 'deny'` policy creates the sandbox with egress blocked.
