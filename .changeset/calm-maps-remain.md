---
'@tanstack/openai-base': patch
---

Fall back to non-strict function tools for free-form map schemas so OpenAI requests preserve dynamic keys and avoid strict-schema validation errors.
