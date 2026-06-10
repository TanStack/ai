---
'@tanstack/ai-anthropic': patch
'@tanstack/openai-base': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-ollama': patch
---

Bind tool calls to the assistant message in tool-first streams by setting AG-UI's
`parentMessageId` on `TOOL_CALL_START`.

When a provider streams a tool call **before** any text, the `StreamProcessor` had no
active assistant message to attach it to, so it created one under a temporary local id.
The later `TEXT_MESSAGE_START` then carried the real provider message id, forcing a
mid-stream id change — which destabilizes `UIMessage.id` and can remount the message
subtree in `useChat` (React list keys, etc.). See #477.

Every text adapter generates one stable assistant message id per stream and already uses
it for `TEXT_MESSAGE_START`; they now also emit it as `parentMessageId` on
`TOOL_CALL_START`. The processor reads `chunk.parentMessageId` (`?? active assistant id`)
so the message is created with the correct id immediately and the subsequent
`TEXT_MESSAGE_START` matches — no rename, no remount.

Fixed across all adapters that emit `TOOL_CALL_START` (Anthropic, OpenAI Responses +
Chat Completions via `@tanstack/openai-base`, OpenRouter, Gemini including the
experimental text-interactions adapter, and Ollama).
