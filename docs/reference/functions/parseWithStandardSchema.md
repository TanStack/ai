---
id: parseWithStandardSchema
title: parseWithStandardSchema
---

# Function: parseWithStandardSchema()

```ts
function parseWithStandardSchema<T>(schema, data): T;
```

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:390](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L390)

Synchronously validates data against a Standard Schema compliant schema.
Note: Some Standard Schema implementations may only support async validation.
In those cases, this function will throw.

## Type Parameters

### T

`T`

## Parameters

### schema

`unknown`

Standard Schema compliant schema

### data

`unknown`

Data to validate

## Returns

`T`

Parsed/validated data

## Throws

StandardSchemaValidationError if validation fails; Error if the
        schema only supports async validation.
