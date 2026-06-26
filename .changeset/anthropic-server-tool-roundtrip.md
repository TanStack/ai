---
'@tanstack/ai-anthropic': patch
'@tanstack/ai': patch
---

Preserve Anthropic server-tool results (`web_search` / `web_fetch`) across turns.

Previously the Anthropic adapter dropped `server_tool_use` and
`web_search_tool_result` / `web_fetch_tool_result` blocks while streaming, so the
evidence never round-tripped — a follow-up turn could no longer see the prior
web-search sources (issue #839). These now stream as a **provider-executed**
tool call carrying the raw result, which the agent loop skips (never executed
client-side) and the adapter replays verbatim into the next request. Adds the
`ProviderExecutedToolMetadata` convention plus `isProviderExecutedToolCall` /
`getProviderExecutedMetadata` helpers to `@tanstack/ai`.

(No e2e: aimock cannot synthesize `server_tool_use` blocks; covered by unit
tests and verified live against the Anthropic API.)
