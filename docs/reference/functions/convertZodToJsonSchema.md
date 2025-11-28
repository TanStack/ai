---
id: convertZodToJsonSchema
title: convertZodToJsonSchema
---

# Function: convertZodToJsonSchema()

```ts
function convertZodToJsonSchema(schema): Record<string, any>;
```

Defined in: [tools/zod-converter.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/zod-converter.ts#L33)

Converts a Zod schema to JSON Schema format compatible with LLM providers.

Uses @alcyone-labs/zod-to-json-schema which is compatible with Zod v4.

## Parameters

### schema

`ZodType`

Zod schema to convert

## Returns

`Record`\<`string`, `any`\>

JSON Schema object that can be sent to LLM providers

## Example

```typescript
import { z } from 'zod';

const schema = z.object({
  location: z.string().describe('City name'),
  unit: z.enum(['celsius', 'fahrenheit']).optional()
});

const jsonSchema = convertZodToJsonSchema(schema);
// Returns:
// {
//   type: 'object',
//   properties: {
//     location: { type: 'string', description: 'City name' },
//     unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
//   },
//   required: ['location']
// }
```
