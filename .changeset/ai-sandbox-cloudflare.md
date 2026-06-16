---
'@tanstack/ai-sandbox-cloudflare': minor
---

New `@tanstack/ai-sandbox-cloudflare` package: a Cloudflare Containers sandbox provider (`cloudflareSandbox`) built on `@cloudflare/sandbox`, for running harness adapters at the edge inside a Worker. Implements the uniform `SandboxHandle` (exec, base64-backed fs, git, `exposePort` preview URLs, env) over the Cloudflare Sandbox Durable Object. The container disk is ephemeral and snapshots are not yet GA, so `withSandbox` re-bootstraps under the same identity across cold starts (`durableFilesystem`/`snapshots` are reported false). Background processes don't expose stdin on Cloudflare, so stdin-fed harnesses (e.g. Claude Code) need a stdin-capable provider; `exec` works fully.
