---
"@tanstack/ai-anthropic": patch
"@tanstack/ai-gemini": patch
---

fix(ai-anthropic, ai-gemini): fix multi-turn conversations failing after tool calls

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
