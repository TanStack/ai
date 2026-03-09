---
id: convertSchemaToJsonSchema
title: convertSchemaToJsonSchema
---

# Function: convertSchemaToJsonSchema()

```ts
function convertSchemaToJsonSchema(schema, options): JSONSchema | undefined;
```

Defined in: [activities/chat/tools/schema-converter.ts:199](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/schema-converter.ts#L199)

Converts a Standard JSON Schema compliant schema or plain JSONSchema to JSON Schema format
compatible with LLM providers.

Supports any schema library that implements the Standard JSON Schema spec (v1):
- Zod v4+ (natively supports StandardJSONSchemaV1)
- ArkType (natively supports StandardJSONSchemaV1)
- Valibot (via `toStandardJsonSchema()` from `@valibot/to-json-schema`)

If the input is already a plain JSONSchema object, it is returned as-is.

## Parameters

### schema

Standard JSON Schema compliant schema or plain JSONSchema object to convert

[`SchemaInput`](../type-aliases/SchemaInput.md) | `undefined`

### options

`ConvertSchemaOptions` = `{}`

Conversion options

## Returns

[`JSONSchema`](../interfaces/JSONSchema.md) \| `undefined`

JSON Schema object that can be sent to LLM providers

## Example

```typescript
// Using Zod v4+ (natively supports Standard JSON Schema)
import * as z from 'zod';

const zodSchema = z.object({
  location: z.string().describe('City name'),
  unit: z.enum(['celsius', 'fahrenheit']).optional()
});

const jsonSchema = convertSchemaToJsonSchema(zodSchema);

@example
// Using ArkType (natively supports Standard JSON Schema)
import { type } from 'arktype';

const arkSchema = type({
  location: 'string',
  unit: "'celsius' | 'fahrenheit'"
});

const jsonSchema = convertSchemaToJsonSchema(arkSchema);

@example
// Using Valibot (via toStandardJsonSchema)
import * as v from 'valibot';
import { toStandardJsonSchema } from '@valibot/to-json-schema';

const valibotSchema = toStandardJsonSchema(v.object({
  location: v.string(),
  unit: v.optional(v.picklist(['celsius', 'fahrenheit']))
}));

const jsonSchema = convertSchemaToJsonSchema(valibotSchema);

@example
// Using JSONSchema directly (passes through unchanged)
const rawSchema = {
  type: 'object',
  properties: { location: { type: 'string' } },
  required: ['location']
};
const result = convertSchemaToJsonSchema(rawSchema);
```
