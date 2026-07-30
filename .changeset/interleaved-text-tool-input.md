---
'@tanstack/ai': patch
---

Fix permanent tool-call `input` corruption when a `TEXT_MESSAGE_CONTENT` event
arrives between two `TOOL_CALL_ARGS` events. Interleaved text force-completes
in-flight tool calls with a lenient partial-JSON parse, and the later
authoritative `TOOL_CALL_END` was skipped because the call was already
`input-complete`, leaving silently truncated values in `input` while
`arguments` held the correct JSON. The processor now re-opens a
force-completed call when further args deltas arrive, so `TOOL_CALL_END` (or
the `RUN_FINISHED` safety net) re-finalizes `input` from the complete
arguments string.
