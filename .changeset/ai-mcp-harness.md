---
'@tanstack/ai-mcp': minor
---

Use MCP in a TanStack AI harness.

- `@tanstack/ai-mcp/harness` adds `createHarnessMcpServer`. It serves a harness as an MCP server, so Claude Code, Claude Desktop, Cursor, or another agent can use it. The tools are `chat`, `steer`, `cancel`, `approve`, `reject`, `resolve`, `answer`, and `status`, plus `agent_<name>` for each exposed agent and `command_<name>` for each exposed command. Every tool takes an optional `threadId`. With `approvals: 'ask'` (the default), the client asks the user about each approval when it supports elicitation. Otherwise the approvals come back in the result. `approvals: 'auto'` approves every tool call. `resolve` answers every kind of interrupt in one call.
- On a host with `access`, `createHarnessMcpServer` reads the user of each HTTP request with `identify`. The host checks each tool call of that user. A host without `access` needs `openAccess: true` (no user) or `openAccess: { principal }` (one local user), else the server throws at the start.
- `@tanstack/ai-mcp/harness` also adds the `mcp()` harness plugin. It connects stdio and HTTP servers by name, gives the model their tools as `<server>_<tool>`, and adds a `/mcp` status command. `oauth: true` signs in to a server with `/connect <name>`.
- `@tanstack/ai-mcp/connector` adds `mcpConnector`: one OAuth MCP server as a harness plugin, with `needsApproval`, `prefix`, `scopes`, and `clientName`. The sign-in passes the `iss` of the callback on (RFC 9207).
- `mcp()` and `mcpConnector` answer the `elicitation/create` requests of MCP spec 2025 servers, and the input requests of spec 2026-07-28 servers, as session questions. One tool call can ask up to 5 times.

`@tanstack/ai-harness` is an optional peer dependency. Only the `./harness` and `./connector` entries need it.
