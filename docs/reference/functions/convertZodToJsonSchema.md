---
id: convertZodToJsonSchema
title: convertZodToJsonSchema
---

# Function: convertZodToJsonSchema()

```ts
function convertZodToJsonSchema(schema): Record<string, any> | undefined;
```

Defined in: [tools/zod-converter.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/zod-converter.ts#L31)

Converts a Zod schema to JSON Schema format compatible with LLM providers.

## Parameters

### schema

Zod schema to convert

`ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\> | `undefined`

## Returns

`Record`\<`string`, `any`\> \| `undefined`

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
