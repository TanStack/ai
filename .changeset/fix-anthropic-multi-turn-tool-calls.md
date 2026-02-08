---
"@tanstack/ai": patch
"@tanstack/ai-client": patch
"@tanstack/ai-anthropic": patch
"@tanstack/ai-gemini": patch
---

fix(ai, ai-client, ai-anthropic, ai-gemini): fix multi-turn conversations failing after tool calls

**Core (@tanstack/ai):**
- Lazy assistant message creation: `StreamProcessor` now defers creating the assistant message until the first content-bearing chunk arrives (text, tool call, thinking, or error), eliminating empty `parts: []` messages from appearing during auto-continuation when the model returns no content
- Add `prepareAssistantMessage()` (lazy) alongside deprecated `startAssistantMessage()` (eager, backwards-compatible)
- Add `getCurrentAssistantMessageId()` to check if a message was created
- **Rewrite `uiMessageToModelMessages()` to preserve part ordering**: the function now walks parts sequentially instead of separating by type, producing correctly interleaved assistant/tool messages (text1 + toolCall1 → toolResult1 → text2 + toolCall2 → toolResult2) instead of concatenating all text and batching all tool calls. This fixes multi-round tool flows where the model would see garbled conversation history and re-call tools unnecessarily.
- Deduplicate tool result messages: when a client tool has both a `tool-result` part and a `tool-call` part with `output`, only one `role: 'tool'` message is emitted per tool call ID

**Client (@tanstack/ai-client):**
- Update `ChatClient.processStream()` to use lazy assistant message creation, preventing UI flicker from empty messages being created then removed

**Anthropic:**

- Fix consecutive user-role messages violating Anthropic's alternating role requirement by merging them in `formatMessages`
- Deduplicate `tool_result` blocks with the same `tool_use_id`
- Filter out empty assistant messages from conversation history
- Suppress duplicate `RUN_FINISHED` event from `message_stop` when `message_delta` already emitted one
- Fix `TEXT_MESSAGE_END` incorrectly emitting for `tool_use` content blocks
- Add Claude Opus 4.6 model support with adaptive thinking and effort parameter

**Gemini:**

- Fix consecutive user-role messages violating Gemini's alternating role requirement by merging them in `formatMessages`
- Deduplicate `functionResponse` parts with the same name (tool call ID)
- Filter out empty model messages from conversation history
