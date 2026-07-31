---
'@tanstack/ai-sandbox': patch
---

A bootstrap shell that dies mid-setup now fails the run instead of exhausting the host's memory, and teardown's `destroy` is no longer cancelled by the abort that triggered it.

**`createBootstrapShell`'s sentinel loop had no exit but the sentinel.** `run()` read lines until it saw `<sentinel> <code>`, and the stdout drainer resolved every parked waiter with `''` once the stream ended — indistinguishable from the empty lines `sh` emits constantly. So when the shell exited without printing its sentinel (a missing binary, an OOM kill, the provider reaping the sandbox mid-bootstrap, a transport reset), the loop spun on an infinite supply of `''`, pushing each one into its output buffer until the host process died of memory exhaustion. Two independent terminators now exist:

- End-of-stream is signalled as `null`, distinct from an empty line, so `run()` rejects the moment the shell is gone — with the drainer's own thrown value attached as `cause` when the stream errored rather than ended.
- A per-command deadline for a shell that stays alive and simply never answers. `BootstrapShellOptions.commandTimeoutMs` configures it; the default is 30 minutes, deliberately generous because setup steps legitimately run that long (`npm install`, image pulls).

`drainStdout` also unblocks every parked waiter in a `finally`, so a throw while iterating stdout can no longer leave callers on a promise nobody resolves.

**`defineSandbox`'s teardown `destroy` no longer forwards `ctx.signal`.** `destroy` runs on every teardown path _including_ the one caused by that signal aborting, so forwarding it handed the provider an already-aborted signal: a provider that honors it did nothing and returned successfully, and the instance-store `delete` that follows then removed the only pointer to a live, billed sandbox. `SandboxInstanceStore` has no `list`, so that sandbox was unreachable from then on. Teardown now uses a fresh controller with its own 60s bound — cleanup outlives whatever cancelled the work, without being able to hang forever. Same reasoning as `close()` never being fenced by the run claim.
