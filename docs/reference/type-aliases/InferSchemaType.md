---
id: InferSchemaType
title: InferSchemaType
---

# Type Alias: InferSchemaType\<T\>

```ts
type InferSchemaType<T> = T extends StandardJSONSchemaV1<infer TInput, unknown> ? TInput : unknown;
```

Defined in: [packages/typescript/ai/src/types.ts:110](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L110)

Infer the TypeScript type from a schema.
For Standard JSON Schema compliant schemas, extracts the input type.
For plain JSONSchema, returns `any` since we can't infer types from JSON Schema at compile time.

## Type Parameters

### T

`T`
