---
'@tanstack/ai': patch
---

fix(ai): infer Zod-typed `outputSchema` instead of collapsing to `unknown`

`chat({ outputSchema: zodSchema })` previously returned `Promise<unknown>` (and
`StructuredOutputCompleteEvent<T>` resolved with `T = unknown`) because
`InferSchemaType` only matched `StandardJSONSchemaV1`. Zod's core `$ZodType`
declares `~standard` as `StandardSchemaV1.Props` — without a type-level
`jsonSchema` converter — so Zod schemas (and any other library that exposes
only the Standard Schema validator surface to the type checker) fell through
to `unknown`, forcing callers to either cast or run a redundant `schema.parse()`.

`SchemaInput` now also accepts `StandardSchemaV1<any, any>`, and
`InferSchemaType` recovers the input type from that branch when the
JSON-schema branch doesn't match. The runtime path is unchanged for Zod /
ArkType / Valibot (`convertSchemaToJsonSchema` still detects the runtime
`~standard.jsonSchema` converter); only the static types are widened.

`convertSchemaToJsonSchema` now throws an actionable error when given a
Standard Schema validator that lacks a JSON-schema converter, instead of
silently shipping the raw `{ '~standard': ... }` object to the LLM provider.

Closes #562
