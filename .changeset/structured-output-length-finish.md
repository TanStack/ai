---
'@tanstack/openai-base': patch
'@tanstack/ai-openrouter': patch
---

`structuredOutput()` now reports a response that was cut off at the output cap (`finish_reason: "length"`) as a truncation error instead of a JSON parse error. A truncated document used to read as a schema failure; the error now says the token limit was reached and which option to raise.
