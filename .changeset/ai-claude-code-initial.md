---
'@tanstack/ai-claude-code': minor
---

New `@tanstack/ai-claude-code` package: a Claude Code harness adapter that runs `@anthropic-ai/claude-agent-sdk` as a TanStack AI chat backend. Claude Code owns the agent loop and executes its built-in tools (bash, file edits, search) server-side; their activity streams back as resolved tool-call events. TanStack `toolDefinition()` server tools are bridged into the harness via an in-process MCP server, sessions are resumable via `modelOptions.sessionId` (surfaced through a `claude-code.session-id` custom event), and structured output uses the harness's native JSON-schema output format.
