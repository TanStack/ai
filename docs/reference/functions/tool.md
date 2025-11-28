---
id: tool
title: tool
---

# Function: tool()

```ts
function tool<TInput, TOutput>(config): Tool<TInput, TOutput>;
```

Defined in: [tools/tool-utils.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-utils.ts#L34)

Helper to define a tool with enforced type safety.

Automatically infers TypeScript types from Zod schemas, providing
full type safety for tool inputs and outputs.

## Type Parameters

### TInput

`TInput` *extends* `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>

### TOutput

`TOutput` *extends* `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\> = `ZodAny`

## Parameters

### config

#### description

`string`

#### execute?

(`args`) => `output`\<`TOutput`\> \| `Promise`\<`output`\<`TOutput`\>\>

#### inputSchema

`TInput`

#### metadata?

`Record`\<`string`, `any`\>

#### name

`string`

#### needsApproval?

`boolean`

#### outputSchema?

`TOutput`

## Returns

[`Tool`](../../interfaces/Tool.md)\<`TInput`, `TOutput`\>

## Example

```typescript
import { tool } from '@tanstack/ai';
import { z } from 'zod';

const getWeather = tool({
  name: 'get_weather',
  description: 'Get the current weather for a location',
  inputSchema: z.object({
    location: z.string().describe('The city and state, e.g. San Francisco, CA'),
    unit: z.enum(['celsius', 'fahrenheit']).optional(),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
  }),
  execute: async ({ location, unit }) => {
    // args are fully typed: { location: string; unit?: "celsius" | "fahrenheit" }
    const data = await fetchWeather(location, unit);
    return data; // validated against outputSchema
  },
});
```
