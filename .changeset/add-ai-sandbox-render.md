---
'@tanstack/ai-sandbox-render': minor
---

Add `@tanstack/ai-sandbox-render`, a sandbox provider backed by
[Render](https://render.com/docs/sandboxes) sandboxes through `@renderinc/sdk`.
It implements the `SandboxProvider` / `SandboxHandle` contract: native file
transfer for reads and writes, shell-backed `list`, `mkdir`, `remove`,
`rename`, `exists` and a non-following `lstat`, commands with separate stdout
and stderr, background processes, a shared env overlay, filesystem or
runtime snapshots, resume by id, and an enforced `deny-all` network policy.

`killableProcesses` is `true` and measured against a real sandbox: every
command records its process group, and `kill()` or an aborted `signal` sends
the requested signal (`TERM` by default) to the group from a second command,
then `KILL` after 2 s. `ports`,
`writableStdin` and `fork` are `false`.
