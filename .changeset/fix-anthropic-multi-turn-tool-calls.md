---
"@tanstack/ai-anthropic": patch
---

fix(ai-anthropic): fix multi-turn conversations failing after tool calls

- Fix consecutive user-role messages violating Anthropic's alternating role requirement by merging them in `formatMessages`
- Deduplicate `tool_result` blocks with the same `tool_use_id`
- Filter out empty assistant messages from conversation history
- Suppress duplicate `RUN_FINISHED` event from `message_stop` when `message_delta` already emitted one
- Fix `TEXT_MESSAGE_END` incorrectly emitting for `tool_use` content blocks
- Add Claude Opus 4.6 model support with adaptive thinking and effort parameter
