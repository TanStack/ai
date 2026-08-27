---
'@tanstack/ai': patch
---

Fix `StreamProcessor` dropping the first `TEXT_MESSAGE_CONTENT` delta when a `TOOL_CALL_START` event's `parentMessageId` precedes that message's `TEXT_MESSAGE_START` — the normal AG-UI shape for "call a tool, then explain the result" as one assistant turn (#1247).
