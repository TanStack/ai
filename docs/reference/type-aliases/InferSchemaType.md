---
id: InferSchemaType
title: InferSchemaType
---

# Type Alias: InferSchemaType\<T\>

```ts
type InferSchemaType<T> = T extends StandardJSONSchemaV1<infer TInput, unknown> ? TInput : T extends StandardSchemaV1<infer TInput, unknown> ? TInput : unknown;
```

Defined in: [packages/typescript/ai/src/types.ts:127](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L127)

Infer the TypeScript type from a schema.
For Standard JSON Schema compliant schemas, extracts the input type.
For Standard Schema validators (e.g. Zod's `~standard` surface), extracts
the input type from the `StandardSchemaV1` shape.
For plain JSONSchema, returns `unknown` since we can't infer types from
JSON Schema at compile time.

## Type Parameters

### T

`T`
