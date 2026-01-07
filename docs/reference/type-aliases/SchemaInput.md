---
id: SchemaInput
title: SchemaInput
---

# Type Alias: SchemaInput

```ts
type SchemaInput = 
  | StandardJSONSchemaV1<any, any>
  | JSONSchema;
```

Defined in: [types.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L77)

Union type for schema input - can be any Standard JSON Schema compliant schema or a plain JSONSchema object.

Standard JSON Schema compliant libraries include:
- Zod v4.2+ (natively supports StandardJSONSchemaV1)
- ArkType v2.1.28+ (natively supports StandardJSONSchemaV1)
- Valibot v1.2+ (via `toStandardJsonSchema()` from `@valibot/to-json-schema`)

## See

https://standardschema.dev/json-schema
