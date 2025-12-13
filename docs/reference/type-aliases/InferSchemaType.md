---
id: InferSchemaType
title: InferSchemaType
---

# Type Alias: InferSchemaType\<T\>

```ts
type InferSchemaType<T> = T extends z.ZodType ? z.infer<T> : any;
```

Defined in: [types.ts:60](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L60)

Infer the TypeScript type from a schema.
For Zod schemas, uses z.infer to get the proper type.
For JSONSchema, returns `any` since we can't infer types from JSON Schema at compile time.

## Type Parameters

### T

`T`
