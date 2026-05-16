---
id: SchemaInput
title: SchemaInput
---

# Type Alias: SchemaInput

```ts
type SchemaInput = 
  | StandardJSONSchemaV1<any, any>
  | StandardSchemaV1<any, any>
  | JSONSchema;
```

Defined in: [packages/typescript/ai/src/types.ts:114](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L114)

Union type for schema input - can be any Standard Schema compliant validator,
any Standard JSON Schema compliant schema, or a plain JSONSchema object.

Standard JSON Schema compliant libraries (carry the JSON-schema converter):
- Zod v4.2+ (natively supports StandardJSONSchemaV1)
- ArkType v2.1.28+ (natively supports StandardJSONSchemaV1)
- Valibot v1.2+ (via `toStandardJsonSchema()` from `@valibot/to-json-schema`)

StandardSchemaV1 covers libraries whose published types only expose the
validator surface — Zod's core `$ZodType['~standard']` is currently typed
as `StandardSchemaV1.Props` even though the runtime attaches the
`jsonSchema` converter, so this branch is what makes `InferSchemaType`
recover the inferred type for callers using `z.ZodType<T>`.

## See

https://standardschema.dev/json-schema
