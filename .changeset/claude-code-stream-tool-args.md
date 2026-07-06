---
'@tanstack/ai-claude-code': patch
---

Stream tool-call arguments in the Claude Code adapter instead of surfacing each
tool call whole. The stream translator only handled `text_delta` and
`thinking_delta` partial events, so a `tool_use` block arrived as a single
completed `TOOL_CALL_START/ARGS/END` at the end of the message. It now also
translates the SDK's partial tool input — `content_block_start` (tool_use),
`content_block_delta` with `input_json_delta`, and `content_block_stop` — into
incremental `TOOL_CALL_ARGS` deltas, matching how the model adapters
(`@tanstack/ai-anthropic`, `@tanstack/ai-openai`) already stream tool args.

The complete `assistant` message dedupes any tool call that already streamed via
partials (tracked by tool-call id, mirroring the existing `text`/`thinking`
message-id dedup), so nothing is emitted twice. With `streamPartials: false`
(partials disabled) tool calls still emit whole from the complete message as
before.

This unblocks streaming structured output on the Claude Code harness: routing
structured data through a tool call now paints incrementally as the model writes
it, rather than atomically at run end.
