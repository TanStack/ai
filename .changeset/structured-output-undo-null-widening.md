---
'@tanstack/ai-utils': minor
'@tanstack/ai': patch
---

Fix structured output validation rejecting `null` for optional fields.

Strict-mode structured output widens optional fields to `required` + nullable, so the provider returns `null` for an absent optional. Validating that `null` against the original schema then failed, because `.optional()` means `T | undefined`, not `T | null` — surfacing as a `StandardSchemaValidationError` (e.g. `Invalid type: Expected string but received null`). This was most visible through `@tanstack/ai-openrouter`, whose adapter preserves provider nulls.

The engine now undoes the widening before validation: it drops the synthesized nulls while preserving the ones a `.nullable()`/`.nullish()` field genuinely allows, so both optional and nullable fields round-trip correctly.

- `@tanstack/ai-utils` adds `undoNullWidening(value, schema)` — a schema-aware counterpart to `transformNullsToUndefined` that only strips nulls the original JSON Schema disallows.
