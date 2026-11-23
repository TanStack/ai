---
'@tanstack/ai-mcp': patch
---

MCP Events follows the final text of SEP-3415 for webhook delivery. `events/subscribe` and `events/unsubscribe` send `Mcp-Name` and `Mcp-Param-*` on HTTP, SSE, and a Streamable HTTP transport instance. An event type whose `x-mcp-header` annotation breaks the transport rules is left out of `events/list`. A control message with no cursor is accepted, and `onGap` can receive `cursor: null`. Webhook signatures use the raw `webhook-timestamp` header, so a timestamp with a leading zero still verifies. Event occurrences keep a JSON object `_meta`. A HeaderMismatch (`-32020`) makes the client list events again and retry that request once.
