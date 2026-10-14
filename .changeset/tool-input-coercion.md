---
'@tanstack/ai': minor
---

Repair common model mistakes in a tool input before the final input check.

- When a JSON Schema tool's input (and every MCP tool's input) fails the check, it is repaired and checked again: `"5"` as `5` (decimal text only), `"true"` as `true`, `5` as `"5"` for a string, and `null` as `""`, `0`, or `false` for a required field. A `null` for an optional field that does not allow `null` is removed. The repair follows unions, `$ref`, `if`/`then`/`else`, `prefixItems`, `patternProperties`, and `additionalProperties`.
- A Standard Schema runs first as written. When it fails and the schema can export JSON Schema (Zod, ArkType, Valibot), the input is repaired and the schema runs again. A failure reports the issues of the first run.
- The received arguments do not change. The tool gets the repaired copy.
- New `chat({ repairToolInput })` option. `false` turns the repair off. A function replaces the built-in repair: it gets `{ tool, toolCall, input, error }` and returns the input to check again, or `undefined` to send the validation error to the model.

Behavior change: a call that failed the check only because of these mistakes now runs with the repaired input.
