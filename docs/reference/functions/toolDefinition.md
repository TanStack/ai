---
id: toolDefinition
title: toolDefinition
---

# Function: toolDefinition()

```ts
function toolDefinition<TInput, TOutput, TName>(config): ToolDefinition<TInput, TOutput, TName>;
```

Defined in: [activities/chat/tools/tool-definition.ts:183](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L183)

Create an isomorphic tool definition that can be used directly or instantiated for server/client

The definition contains all tool metadata (name, description, schemas) and can be:
1. Used directly in chat() on the server (as a tool definition without execute)
2. Instantiated as a server tool with .server()
3. Instantiated as a client tool with .client()

Supports any Standard JSON Schema compliant library (Zod v4+, ArkType, Valibot, etc.)
or plain JSON Schema objects.

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TName

`TName` *extends* `string` = `string`

## Parameters

### config

[`ToolDefinitionConfig`](../interfaces/ToolDefinitionConfig.md)\<`TInput`, `TOutput`, `TName`\>

## Returns

[`ToolDefinition`](../interfaces/ToolDefinition.md)\<`TInput`, `TOutput`, `TName`\>

## Example

```typescript
import { toolDefinition } from '@tanstack/ai';
import { z } from 'zod';

// Using Zod (natively supports Standard JSON Schema)
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
