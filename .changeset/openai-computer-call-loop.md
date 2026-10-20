---
'@tanstack/openai-base': patch
---

The computer use loop of `computerUseTool()` runs. A `computer_call` from the model is now a tool call to `computer_use_preview`, with the `action` and the `pending_safety_checks` as its input. The tool result goes back as `computer_call_output`, with the first image of the result as the screenshot. When the call does not fail, the output acknowledges the safety checks of the call.
