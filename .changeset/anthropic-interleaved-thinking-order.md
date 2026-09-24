---
'@tanstack/ai': patch
---

Keep Anthropic's signed thinking order when a provider-executed tool (web_search / web_fetch) runs inside the same response as thinking, and stop provider-executed calls from being classified as client tool interrupts.

- `uiMessagesToWire` now splits an assistant message into ordered segments at every thinking part that follows a provider-executed tool call (the rule `buildAssistantMessages` already applies), instead of emitting all `reasoning` messages first and one anchor with the joined text and every tool call. Later anchors get `${id}-segment-${n}` ids.
- The run loop records the iteration's thinking, text and tool calls in arrival order and writes one assistant `ModelMessage` per segment, so the interrupt `MESSAGES_SNAPSHOT` and the server-side continuation history keep the order too.
- `getBoundaryActionableToolRequests` and `executeToolCalls` skip provider-executed calls, so a run that mixes web search with a client tool no longer parks on "Client tool web_search is ready to run" interrupts.
- A `MESSAGES_SNAPSHOT` and `modelMessagesToUIMessages` fold `${id}-segment-${n}` messages back into their parent, so the UI still shows one assistant message per response.

Without this, the turn after such a response fails with Anthropic's `thinking or redacted_thinking blocks in the latest assistant message cannot be modified`.
