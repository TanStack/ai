---
'@tanstack/ai-opencode': minor
---

New `@tanstack/ai-opencode` package: an OpenCode harness adapter that drives [OpenCode](https://opencode.ai) (via `@opencode-ai/sdk`) as a TanStack AI chat backend. OpenCode owns the agent loop and executes its built-in tools (shell, file edits, search) locally; assistant text and thinking stream as token-level deltas, and tool activity streams back as resolved tool-call events. TanStack `toolDefinition()` server tools are bridged into the harness via a localhost MCP server, sessions are stateful and resumable, and OpenCode permission requests are answered by a configurable `permissionMode` (`default` / `acceptEdits` / `bypassPermissions` or a custom handler). Server-only (Node); requires the `opencode` CLI to be installed and authenticated on the host.
