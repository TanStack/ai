---
id: MCPConnectionPolicy
title: MCPConnectionPolicy
---

# Type Alias: MCPConnectionPolicy

```ts
type MCPConnectionPolicy = "close" | "keep-alive";
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L27)

Controls what happens to MCP connections when the chat run ends.

- `'close'` (default) — `chat()` closes each connection when the run ends
  (after the agent loop completes and the stream is drained), so tools can
  still execute throughout the run.
- `'keep-alive'` — `chat()` never closes the connections; the caller owns
  their lifecycle (e.g. keep them warm across requests).
