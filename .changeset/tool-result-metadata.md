---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-mcp': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-devtools-core': minor
'@tanstack/ai-effect': patch
---

A server tool can now send result metadata: app data that the UI and middleware see and the model never sees. Call `context?.setResultMetadata?.(value)` in the tool. Add `resultMetadataSchema` to the tool definition to type and check the value. The client reads it as a typed `part.resultMetadata` on the tool-call part, also after a reload with persistence.

- `onAfterToolCall` gets `info.metadata`. A `replaceResult` or `skip` decision can set `metadata`. `toolCacheMiddleware` keeps the metadata on a cache hit.
- `@tanstack/ai-mcp` copies the `_meta` of an MCP tool result into the result metadata. A `tanstack` key is dropped.
- `@tanstack/ai-persistence` keeps the stored app metadata when a client copy replaces a stored tool message. The `'messages.metadata'` conformance check now also tests a tool message with nested app metadata.
- The server owns the result metadata. `chatParamsFromRequest` keeps only the `tanstack` key on the tool rows of a request.
- Client tools and WebMCP tools throw when they call `setResultMetadata`.
- `@tanstack/ai-effect` accepts tool definitions that have `resultMetadataSchema`.
- `@tanstack/ai-event-client` adds `metadata` to the tool result event. The devtools show it as "Result metadata" on each tool result.
