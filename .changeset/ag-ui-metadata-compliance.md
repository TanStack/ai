---
"@tanstack/ai": minor
"@tanstack/ai-client": minor
"@tanstack/ai-event-client": minor
"@tanstack/ai-persistence": minor
"@tanstack/ai-sandbox": minor
---

Put AG-UI extras under `metadata.tanstack` and make public `StreamChunk` spec-only.

`sendMessage({ content, metadata })` stamps user metadata on the user message.
`chat()` yields spec events. Read tool input and output from `UIMessage` parts.
Wire messages use `content` / `toolCalls` / fan-out roles, not `parts`.
