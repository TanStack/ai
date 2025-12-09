---
id: toolDefinition
title: toolDefinition
---

# Function: toolDefinition()

```ts
function toolDefinition<TInput, TOutput, TName>(config): ToolDefinition<TInput, TOutput, TName>;
```

Defined in: [tools/tool-definition.ts:174](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L174)

Create an isomorphic tool definition that can be used directly or instantiated for server/client

The definition contains all tool metadata (name, description, schemas) and can be:
1. Used directly in chat() on the server (as a tool definition without execute)
2. Instantiated as a server tool with .server()
3. Instantiated as a client tool with .client()

## Type Parameters

### TInput

`TInput` *extends* `SchemaInput` = `ZodAny`

The input schema type - can be a Zod schema or JSON Schema object.

### TOutput

`TOutput` *extends* `SchemaInput` = `ZodAny`

The output schema type - can be a Zod schema or JSON Schema object.

### TName

`TName` *extends* `string` = `string`

## Parameters

### config

[`ToolDefinitionConfig`](../interfaces/ToolDefinitionConfig.md)\<`TInput`, `TOutput`, `TName`\>

## Returns

[`ToolDefinition`](../interfaces/ToolDefinition.md)\<`TInput`, `TOutput`, `TName`\>

## Schema Options

Tool schemas can be defined using either **Zod schemas** or **JSON Schema objects**:

- **Zod schemas**: Provide full TypeScript type inference and runtime validation
- **JSON Schema objects**: Useful when you have existing JSON Schema definitions or prefer not to use Zod

> **Note:** When using JSON Schema, TypeScript will infer `any` for input/output types. Zod schemas are recommended for full type safety.

## Example: Using Zod Schemas

```typescript
import { toolDefinition } from '@tanstack/ai';
import { z } from 'zod';

const addToCartTool = toolDefinition({
  name: 'addToCart',
  description: 'Add a guitar to the shopping cart (requires approval)',
  needsApproval: true,
  inputSchema: z.object({
    guitarId: z.string(),
    quantity: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    cartId: z.string(),
    totalItems: z.number(),
  }),
});

// Use directly in chat (server-side, no execute function)
chat({
  tools: [addToCartTool],
  // ...
});

// Or create server-side implementation
const addToCartServer = addToCartTool.server(async (args) => {
  // args is typed as { guitarId: string; quantity: number }
  return {
    success: true,
    cartId: 'CART_' + Date.now(),
    totalItems: args.quantity,
  };
});

// Or create client-side implementation
const addToCartClient = addToCartTool.client(async (args) => {
  // Client-specific logic (e.g., localStorage)
  return { success: true, cartId: 'local', totalItems: 1 };
});
```

## Example: Using JSON Schema

```typescript
import { toolDefinition } from '@tanstack/ai';
import type { JSONSchema } from '@tanstack/ai';

// Define input schema using JSON Schema
const inputSchema: JSONSchema = {
  type: 'object',
  properties: {
    location: {
      type: 'string',
      description: 'The city or location to get weather for',
    },
    unit: {
      type: 'string',
      enum: ['celsius', 'fahrenheit'],
      description: 'Temperature unit (defaults to celsius)',
    },
  },
  required: ['location'],
};

// Define output schema using JSON Schema
const outputSchema: JSONSchema = {
  type: 'object',
  properties: {
    location: { type: 'string' },
    temperature: { type: 'number' },
    unit: { type: 'string' },
    conditions: { type: 'string' },
  },
  required: ['location', 'temperature', 'unit', 'conditions'],
};

// Create tool definition with JSON Schema
const getWeatherTool = toolDefinition({
  name: 'getWeather',
  description: 'Get the current weather for a location',
  inputSchema,
  outputSchema,
});

// Create server implementation
// Note: args is typed as `any` when using JSON Schema
const getWeatherServer = getWeatherTool.server((args) => {
  const location = args.location.toLowerCase();
  const unit = args.unit || 'celsius';
  
  // Mock weather data
  return {
    location: args.location,
    temperature: 22,
    unit,
    conditions: 'Partly cloudy',
  };
});

// Use in chat
chat({
  adapter: anthropic(),
  model: 'claude-sonnet-4-5',
  messages,
  tools: [getWeatherServer],
});
```
