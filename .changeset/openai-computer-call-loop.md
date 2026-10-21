---
'@tanstack/openai-base': patch
---

The computer use loop of `computerUseTool()` runs. A `computer_call` from the model is now a tool call to `computer_use_preview`, with the `action` and the `pending_safety_checks` as its input. The tool result goes back as `computer_call_output`, with the first image of the result as the screenshot. When the call does not fail, the output acknowledges the safety checks of the call.

A failed computer call sends the newest screenshot of the conversation, because the failed call has no screenshot of its own. A computer call output has no text, so the reason for the failure goes to the model in a user message after the call outputs.

A computer tool result with no image fails the run with an error. Before, the adapter sent an empty screenshot.
