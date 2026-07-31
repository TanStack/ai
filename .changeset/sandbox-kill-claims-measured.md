---
'@tanstack/ai-sandbox-cloudflare': patch
'@tanstack/ai-sandbox-daytona': patch
'@tanstack/ai-sandbox-sprites': patch
'@tanstack/ai-sandbox-vercel': patch
---

`SandboxCapabilities.killableProcesses` is now either measured or falsifiable on every bundled remote provider, instead of asserted in a comment.

The flag is not cosmetic: `journalReadStrategy` reads it to pick `'follow'` (a spawned `tail -c +N -f`) over `'poll'` (bounded `exec` reads). A wrong `true` starts a process the host then cannot stop, leaking one per run. Two providers were recently probed and **both** declared it falsely, so the remaining declarations were audited rather than trusted.

- **Vercel** — `killableProcesses` is now `false`. Its `kill()` only called `controller.abort()`, and that signal reaches nothing: `@vercel/sandbox` forwards a detached command's `signal` to the HTTP request that _starts_ the command (already resolved by the time the handle exists) and to a log pipe this handle does not use. `kill()` was a no-op that left the remote process running — the same client-side-detach shape as the Docker defect. `kill()` now issues the SDK's real server-side `Command.kill('SIGKILL')` (and the caller's `signal` routes through the same path, best-effort so teardown cannot throw), but whether that reaches the forked `tail -f` is unmeasured, so the capability stays `false` and reads poll.
- **Daytona** — `killableProcesses` is now `false`. `kill()` aborts the client-side poll loop and resolves _before_ anything attempts termination; the `deleteSession` that was supposed to be the kill runs later from the pump's teardown, swallows its own failures, and is documented as cleanup for a _completed_ session.
- **Sprites** — left `true`, because its `kill()` is a genuine server-side `POST /exec/<sessionId>/kill` rather than a stream detach — but the declaration is now labelled unverified: what that endpoint signals (process group or pid) is undocumented, and the follow command is a multi-statement shell whose `tail -f` is necessarily a child.
- **Cloudflare** — `false` confirmed by behavior, not by reading the constant: a test drives a still-running command, calls `kill()`, and asserts nothing was cancelled and no `AbortSignal` ever reached `exec` (Workers RPC cannot serialize one), then that `journalReadStrategy` answers `'poll'`.

Daytona, Vercel, and Sprites each register the shared journal conformance suite. With credentials present it measures the claim against a real sandbox; without them it reports a **named skip** carrying the reason, never a silent pass.

Separately, `@tanstack/ai-sandbox-cloudflare`'s `pipeToRunLog` now honors its documented "never rejects" contract. `log.open`, the terminal `log.finish`, the recovery `append`/`finish`, and the final record re-read were all unguarded, and `RunController.start` consumes the promise fire-and-forget — so any of them rejecting was an unhandled rejection, which is **instance-fatal inside a Durable Object**. Every call is now individually guarded and reports through an optional `logger`, a failing re-read falls back to a locally rebuilt terminal record instead of throwing, and the fire-and-forget hand-offs use two-argument `then` rather than `.finally` (which adopts rejections).
