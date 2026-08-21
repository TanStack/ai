---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-sandbox': minor
'@tanstack/openai-base': patch
'@tanstack/ai-openrouter': patch
---

Put AG-UI extras under `metadata.tanstack`. SSE/HTTP wire events are spec-only.

`sendMessage({ content, metadata })` stamps user metadata on the user message.
In-process `chat()` still yields `toolName`, `TOOL_CALL_END.input`, and TanStack `TokenUsage`.
Thinking signatures round-trip on `REASONING_ENCRYPTED_VALUE`.
Wire messages use `content` / `toolCalls` / fan-out roles, not `parts`.
