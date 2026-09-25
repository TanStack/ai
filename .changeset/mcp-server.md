---
'@tanstack/ai-mcp': minor
'@tanstack/ai': minor
---

`@tanstack/ai-mcp` can create an MCP server with `createMCPServer` and `serveMCPStdio`. The client package moves from `@modelcontextprotocol/sdk` to `@modelcontextprotocol/client` and `@modelcontextprotocol/server`. The client tries spec 2026-07-28 first, then the 2025 handshake. When an MCP server asks for input, `chat()` pauses with an `mcp_input` interrupt. Answer it with `resolveInterrupt` or `cancel()`, and the tool runs again with the answer in `ctx.inputResponse`. A tool can set `execution: 'task'` for a spec 2025 task handle. A tool reads `requestInput` and `sample` on `ctx.context`, typed by `MCPToolContext`. The server `auth` option takes the MCP SDK `OAuthTokenVerifier` shape. `jwtVerifier` and `introspectionVerifier` cover JWT and opaque tokens, and a tool reads the token as `ctx.context.authInfo`. `createMCPClient<typeof server>({ transport })` types a remote client from a `createMCPServer` server, and `createMCPClient({ server })` calls a server in the same process.
