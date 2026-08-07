---
'@tanstack/ai-mcp': minor
---

Forward MCP tool annotations and titles onto discovered tools. Each tool's
`metadata.mcp` now carries the server's `annotations` object verbatim
(`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`,
`annotations.title`) plus a resolved display `title` (`title` →
`annotations.title` → `name`), on both the auto-discovery and explicit
`tools([...defs])` paths. Hosts can now label MCP tools and gate approvals on
the server's hints instead of only seeing a name and description.

The metadata is typed, not just documented. Every `tools()` overload — the
single client, the explicit `tools([...defs])` path, and the `createMCPClients`
pool — now returns `McpServerTool`s: structurally still `ServerTool`s (they drop
straight into `chat({ tools })`), but with `metadata.mcp` statically known to be
present and shaped like `McpToolMetadata`. So the read infers on its own:

```ts
const tools = await mcp.tools()
tools.map((tool) => tool.metadata.mcp.annotations?.readOnlyHint) // boolean | undefined
tools.map((tool) => tool.metadata.mcp.annotaions) // compile error
```

Adds the exported `McpServerTool` and `McpToolMetadata` types, and re-exports
the SDK's `ToolAnnotations` type. `McpToolMetadata.serverToolName` and `.title`
are required (both are always stamped), so consumers no longer write a fallback
for a value that is never missing.
