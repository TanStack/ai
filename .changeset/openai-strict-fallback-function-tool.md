---
'@tanstack/openai-base': patch
---

Apply the strict-mode fallback in the provider-path `function-tool` converter. A tool whose input JSON Schema can't satisfy OpenAI's strict function-calling constraints now falls back to a non-strict tool definition (matching the converter's other path) instead of emitting an invalid strict tool, so such tools work across the OpenAI-based adapters (`@tanstack/ai-openai`, `@tanstack/ai-grok`, `@tanstack/ai-groq`).
