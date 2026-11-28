---
'@tanstack/openai-base': patch
---

Drop a `response.function_call_arguments.delta` that arrives after the call already ended (via `function_call_arguments.done` or `output_item.done`). It was emitted as `TOOL_CALL_ARGS` after `TOOL_CALL_END`, so the extra text was appended to the finalized arguments, parsing failed, and the tool did not run. The late delta is now logged and ignored.
