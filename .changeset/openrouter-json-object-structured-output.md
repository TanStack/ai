---
'@tanstack/ai-openrouter': patch
---

Honor `modelOptions.responseFormat: { type: 'json_object' }` during structured
output generation while preserving strict `json_schema` as the default.
