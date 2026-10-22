---
'@tanstack/ai-mcp': minor
---

Add experimental MCP Events (SEP-3415) webhook support.

- `createMCPClient({ experimental_events: { store } | { adapter } })` adds `client.experimental_events` with `list`, `subscribe`, `refresh` and `unsubscribe` (direct) or adapter-delegated operations (managed).
- New `@tanstack/ai-mcp/events` subpath: `createMCPEventWebhook`, `inMemoryMCPEventStore`, `createMCPEventSecret`, `signMCPEventPayload`.
