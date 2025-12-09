---
id: convertZodToJsonSchema
title: convertZodToJsonSchema
---

# Function: convertZodToJsonSchema()

```ts
function convertZodToJsonSchema(schema): Record<string, any> | undefined;
```

Defined in: [tools/zod-converter.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/zod-converter.ts#L57)

Converts a schema (Zod or JSONSchema) to JSON Schema format compatible with LLM providers.
If the input is already a JSONSchema object, it is returned as-is.
If the input is a Zod schema, it is converted to JSON Schema.

## Parameters

### schema

Zod schema or JSONSchema object to convert

[`SchemaInput`](../type-aliases/SchemaInput.md) | `undefined`

## Returns

`Record`\<`string`, `any`\> \| `undefined`

JSON Schema object that can be sent to LLM providers

## Example

```typescript
import { z } from 'zod';

// Using Zod schema
const zodSchema = z.object({
  location: z.string().describe('City name'),
  unit: z.enum(['celsius', 'fahrenheit']).optional()
});

const jsonSchema = convertZodToJsonSchema(zodSchema);
// Returns:
// {
//   type: 'object',
//   properties: {
//     location: { type: 'string', description: 'City name' },
//     unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
//   },
//   required: ['location']
// }

// Using JSONSchema directly (passes through unchanged)
const rawSchema = {
  type: 'object',
  properties: { location: { type: 'string' } },
  required: ['location']
};
const result = convertZodToJsonSchema(rawSchema);
// Returns the same object
```
