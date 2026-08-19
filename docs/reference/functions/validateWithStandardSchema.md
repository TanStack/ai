---
id: validateWithStandardSchema
title: validateWithStandardSchema
---

# Function: validateWithStandardSchema()

```ts
function validateWithStandardSchema<T>(schema, data): Promise<
  | {
  data: T;
  success: true;
}
  | {
  issues: object[];
  success: false;
}>;
```

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:383](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L383)

Validates data against a Standard Schema compliant schema.

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

`Promise`\<
  \| \{
  `data`: `T`;
  `success`: `true`;
\}
  \| \{
  `issues`: `object`[];
  `success`: `false`;
\}\>

Validation result with success status, data or issues
