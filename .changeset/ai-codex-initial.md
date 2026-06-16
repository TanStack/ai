---
'@tanstack/ai-codex': minor
---

New `@tanstack/ai-codex` package: a Codex **harness adapter that runs inside a sandbox**. It declares `requires: [SandboxCapability]` and spawns `codex exec --experimental-json` inside the sandbox provided by `withSandbox(...)` (mirroring `@openai/codex-sdk`'s own CLI invocation), feeding the prompt via stdin and streaming its JSONL thread events back as AG-UI chunks. Codex owns the agent loop and executes its built-in tools (shell, file changes, web search, todo lists) against the sandbox workspace. Threads are resumable via `modelOptions.sessionId` (surfaced through a `codex.session-id` custom event); sandbox mode / approval policy / reasoning effort map to codex CLI flags. Requires the `codex` executable and `CODEX_API_KEY` (or a `codex login`) in the sandbox. chat()-provided server tools are bridged into the agent via the host MCP tool-proxy.
