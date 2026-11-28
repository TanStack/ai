---
'@tanstack/openai-base': patch
---

Apply the strict structured-output conversion to schemas inside `$defs` and `definitions`. Recursive schemas (for example from zod 4) previously reached the API with optional properties missing from `required`, which OpenAI and Azure OpenAI reject.
