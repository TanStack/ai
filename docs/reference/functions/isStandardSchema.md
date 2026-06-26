---
id: isStandardSchema
title: isStandardSchema
---

# Function: isStandardSchema()

```ts
function isStandardSchema(schema): schema is StandardSchemaV1<unknown, unknown>;
```

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L73)

Check if a value is a Standard Schema compliant schema (for validation).
Standard Schema compliant libraries implement the '~standard' property with a validate function.

## Parameters

### schema

`unknown`

## Returns

`schema is StandardSchemaV1<unknown, unknown>`
