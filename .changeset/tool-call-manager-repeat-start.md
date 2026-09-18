---
'@tanstack/ai': patch
---

Fix `ToolCallManager.addToolCallStartEvent` running a tool call twice (or wiping its accumulated arguments) when a producer sends a repeat `TOOL_CALL_START` for a `toolCallId` that is already tracked. AG-UI's `TOOL_CALL_START` carries no `index`, so a custom/malformed stream that re-sends START for the same id could either overwrite the tracked entry's arguments back to `''` (same index) or insert a duplicate row that `getToolCalls()` returned twice (missing/different index). Repeats for an already-tracked id are now ignored; first-party adapters, which only emit START once per call, are unaffected.
