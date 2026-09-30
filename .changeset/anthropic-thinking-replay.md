---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
---

Send Claude's thinking and tool errors back the way Claude sent them.

- A tool message with `error` now sends `tool_result.is_error: true`, so Claude sees that the tool failed.
- A `redacted_thinking` block is no longer dropped. It becomes a thinking part with `redacted: true`, an empty `content`, and the encrypted data in `signature`. The flag survives the stream, the UI messages, the wire, and stored threads, and the next request sends the block back as `{ type: 'redacted_thinking', data }`.
- `ThinkingPart` and `ModelMessage['thinking']` have the new optional `redacted` field.
