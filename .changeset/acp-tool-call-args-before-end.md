---
'@tanstack/ai-acp': patch
---

Keep a tool call opened without `rawInput` open until its input arrives, so the later `tool_call_update` sends `TOOL_CALL_ARGS` before `TOOL_CALL_END`. It was sent after the call had ended, and the UI appended it to the finalized arguments as doubled JSON. A call that resolves or is interrupted without input is closed with its title before its result.
