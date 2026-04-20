---
'@tanstack/ai': patch
---

fix(ai): make optional nested objects and arrays nullable under `forStructuredOutput`. Previously `makeStructuredOutputCompatible` recursed into optional composites and skipped the `'null'`-wrap, but still added them to `required[]`, producing a schema that OpenAI-style strict `json_schema` providers reject. Any schema with an optional `z.object({...}).optional()` or `z.array(...).optional()` field now serializes as `type: ['object','null']` / `['array','null']` and passes strict validation.
