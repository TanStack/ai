---
'@tanstack/ai-codex': minor
---

New `@tanstack/ai-codex` package: a Codex harness adapter that runs `@openai/codex-sdk` as a TanStack AI chat backend. Codex owns the agent loop and executes its built-in tools (shell commands, file changes, web search, todo lists) server-side inside its sandbox; their activity streams back as resolved tool-call events. TanStack `toolDefinition()` server tools are bridged into the harness via a localhost Streamable-HTTP MCP server, threads are resumable via `modelOptions.sessionId` (surfaced through a `codex.session-id` custom event), and structured output uses the harness's native `outputSchema` support. Note: the Codex SDK reports assistant text only as completed messages — tool activity streams live, text arrives message-at-a-time.
