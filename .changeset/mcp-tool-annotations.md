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

Adds the exported `McpToolMetadata` type describing the full `metadata.mcp`
block, and re-exports the SDK's `ToolAnnotations` type.
