---
'@tanstack/ai-sandbox-cloudflare': patch
'@tanstack/ai-claude-code': patch
---

Fix the Claude Code harness never starting its turn in a Cloudflare sandbox (runs sat at `status:running` forever, streaming nothing). Two root causes:

- **`@tanstack/ai-claude-code`**: the adapter defaults `--permission-mode bypassPermissions`, which Claude Code maps to `--dangerously-skip-permissions` and refuses to run as root. Sandbox containers (Docker/Cloudflare) run as root, so `claude` died instantly. The adapter now sets `IS_SANDBOX=1` in the CLI's environment (Claude Code's documented escape hatch for running skip-permissions in an isolated environment), merged over any caller-provided env.
- **`@tanstack/ai-sandbox-cloudflare`**: `spawn()` used `@cloudflare/sandbox`'s background-process API (`startProcess` + `streamProcessLogs`), whose `onOutput`/`onExit` callbacks never fire, so a stdout-NDJSON harness hung forever. `spawn()` now streams over `exec({ stream: true, onOutput })` — the same proven command path as one-shot `exec` — and resolves the exit code from its result. The caller's `AbortSignal` is no longer forwarded across the Durable Object RPC boundary (Workers RPC cannot serialize an `AbortSignal`, which previously threw before the command ran); mid-run cancellation is unavailable on this provider and a stuck run is bounded by the coordinator watchdog instead. A failed command now rejects `wait()` so the adapter surfaces a `RUN_ERROR` rather than a silent zero-output run.
