---
'@tanstack/ai-mcp': minor
'@tanstack/ai': minor
---

Add `@tanstack/ai-mcp`: a host-side Model Context Protocol client. Discover and run MCP server tools (and read resources/prompts) inside any adapter's `chat()` loop, with three type-safety modes (auto-discovery, hand-written `toolDefinition()` binding, and generated end-to-end types via `npx @tanstack/ai-mcp generate`). Includes `createMCPClients` for connecting to multiple servers with auto-prefixed tool names. Also exposes `abortSignal` on `ToolExecutionContext` so long-running tools (e.g. MCP `callTool`) cancel with the chat run.
