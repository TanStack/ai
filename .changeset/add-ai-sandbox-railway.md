---
'@tanstack/ai-sandbox-railway': minor
---

Add `@tanstack/ai-sandbox-railway`, a sandbox provider backed by
[Railway](https://railway.com) sandboxes through the `railway` SDK. It
implements the `SandboxProvider` / `SandboxHandle` contract: native file
operations with a recursive `remove` and a non-following `lstat`, commands
with separate stdout and stderr and native `cwd`/`env`, background processes,
a handle-local env overlay, native environment-scoped checkpoints that restore
after their source is destroyed (named `tsai-<sandbox-id>-<uuid>`), live disk
fork, resume-by-id with strict status handling, and optional create-time HTTP
domains (`ports`, which require `networkIsolation: 'PRIVATE'`).

`writableStdin` and `killableProcesses` are `true` and measured against
production: spawned processes get a flow-controlled stdin writer, and `kill()`
or an aborted `signal` terminates the process group and settles on the
confirmed remote exit. Blocking `exec` runs without a durable session and caps
captured output. `resources` sizes each sandbox. An `endpoint` override must use `https`
(plain `http` is accepted only for localhost). `networkPolicy` and
`durableFilesystem` are `false`.
