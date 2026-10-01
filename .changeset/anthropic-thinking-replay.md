---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
---

Send Claude's thinking and tool errors back the way Claude sent them.

- A tool message with `error` now sends `tool_result.is_error: true`, so Claude sees that the tool failed.
- A `redacted_thinking` block is no longer dropped. It becomes a thinking part with `redacted: true`, an empty `content`, and the encrypted data in `signature`. The flag survives the stream, the UI messages, the wire, and stored threads, and the next request sends the block back as `{ type: 'redacted_thinking', data }`.
- On the AG-UI wire, a redacted block is its own reasoning message. Its id starts with `redacted_thinking-`, and the `REASONING_ENCRYPTED_VALUE` event's `entityId` points to that id. An AG-UI client keeps message ids, so it sends the block back as redacted data, not as a signature.
- A thinking block's signature now names its reasoning message in `entityId`, not the step. An AG-UI client attaches the signature to that message, so it can send it back.
- `ThinkingPart` and `ModelMessage['thinking']` have the new optional `redacted` field.
