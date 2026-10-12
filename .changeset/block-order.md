---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
---

Keep the order of Claude's thinking, text, and tool calls in one answer.

- Claude can answer with thinking, a tool call, more thinking, and another tool call. The stream, the stored messages, the client wire, and the next request to Claude keep that order.
- `ModelMessage` has a new optional `blockOrder` field. The library writes it only when the order is not the default (thinking, then text, then tool calls), so a message in the default order does not change. `orderedAssistantBlocks(message)` gives adapter authors the blocks in order.
- Each Claude thinking block ends with its own `REASONING_MESSAGE_END` and `REASONING_END`.
- Text after a second thinking block starts a new text part.
- On the client wire, an answer in another order goes out as ordered rows. A row that exists only for the order has `metadata.tanstack.continues`, and the server joins it back into one message. A `UIMessage` that holds two model calls with a tool result between them reaches the server as assistant, tool, assistant, for every adapter.
