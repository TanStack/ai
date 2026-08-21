---
'@tanstack/ai': patch
---

Fix tool-call `input` corruption when a `TEXT_MESSAGE_CONTENT` event arrives between `TOOL_CALL_ARGS` events. Text events no longer force-complete in-flight tool calls, and `input` is only set when a strict `JSON.parse` of the accumulated arguments succeeds.
