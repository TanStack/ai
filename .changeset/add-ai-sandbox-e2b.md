---
'@tanstack/ai-sandbox-e2b': minor
---

Add `@tanstack/ai-sandbox-e2b`, a sandbox provider backed by managed
[E2B](https://e2b.dev) cloud sandboxes. It implements the `SandboxProvider` /
`SandboxHandle` contract: native filesystem reads and writes, commands with
separate stdout and stderr and native `cwd`/`env`, background processes with a
real sandbox pid and writable stdin, preview URLs (token-gated when public
traffic is disabled), native snapshots and restore, fork, resume-by-id, and a
`network: 'deny'` policy mapped onto E2B's internet switch.

Every command runs as a `setsid` process-group leader so `kill()` reaches
backgrounded children; `killableProcesses` is measured by the shared journal
conformance suite, not asserted. Sandboxes default to a 30 minute lifetime and
are killed when it elapses.
