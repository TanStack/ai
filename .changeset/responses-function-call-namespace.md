---
'@tanstack/openai-base': patch
---

Send the `namespace` of a function call back to the Responses API. A tool that came through `additional_tools` is called in a namespace, and without it the next request failed with `400 Missing namespace for function_call`. The adapter now keeps the namespace in the tool call metadata and sends it with the replayed `function_call` item.
