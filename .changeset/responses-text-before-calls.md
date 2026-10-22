---
'@tanstack/openai-base': patch
---

Responses replay no longer puts an assistant's text between a `function_call` and its `function_call_output`. The text now goes before the calls. DeepSeek rejected the old order with `No tool output found for function call`.
