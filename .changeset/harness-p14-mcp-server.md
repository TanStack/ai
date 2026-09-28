---
'@tanstack/ai-mcp': minor
'@tanstack/ai-harness-cli': minor
---

`@tanstack/ai-mcp`: add `createHarnessMcpServer` at `@tanstack/ai-mcp/harness`. It serves a harness as an MCP server, so Claude Code, Claude Desktop, Cursor, or another agent can use it. The tools are `chat`, `steer`, `cancel`, `approve`, `reject`, `resolve`, `answer`, and `status`, plus `agent_<name>` for each exposed agent and `command_<name>` for each plugin command. Every tool takes an optional `threadId`. With `approvals: 'ask'` (the default), the client asks the user about each approval when it supports elicitation. Otherwise the approvals come back in the result. `approvals: 'auto'` approves every tool call. Each interrupt in a result has a `kind`: `approval`, `client-tool`, or `generic`. `resolve` answers every kind in one call: `approved` for an approval, and `payload` for the others.

`@tanstack/ai-harness-cli`: `--mcp` serves the harness as an MCP server over stdio, and `--yes` approves every tool call in MCP mode. `--serve` also serves MCP at `/mcp`, behind the same bearer token. Both need `@tanstack/ai-mcp`, which is an optional peer dependency.
