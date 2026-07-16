---
id: toolDefinition
title: toolDefinition
---

# Function: toolDefinition()

```ts
function toolDefinition<
  TInput,
  TOutput,
  TName,
  TNeedsApproval,
  TApprovalSchema,
>(config): ToolDefinition<
  TInput,
  TOutput,
  TName,
  TNeedsApproval,
  TApprovalSchema
>
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:191](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L191)

Create an isomorphic tool definition that can be used directly or instantiated for server/client

The definition contains all tool metadata (name, description, schemas) and can be:
1. Used directly in chat() on the server (as a tool definition without execute)
2. Instantiated as a server tool with .server()
3. Instantiated as a client tool with .client()

Supports any Standard JSON Schema compliant library (Zod v4+, ArkType, Valibot, etc.)
or plain JSON Schema objects.

## Conditional approval schema

`approvalSchema` is available only when `needsApproval: true`. It accepts either
one Standard Schema/JSON Schema for both decisions or a nonempty branch map:

```ts
type ApprovalSchemaConfig =
  | SchemaInput
  | { approve: SchemaInput; reject?: SchemaInput }
  | { approve?: SchemaInput; reject: SchemaInput }
```

The schema generic is preserved by `.server()` and `.client()`. Client
`tool-approval` interrupts infer the selected branch payload, require it when
the schema requires it, and place it under `payload`. Approval may also carry an
optional, fully validated `editedArgs` replacement when the tool has an input
schema. Rejection never accepts edited arguments.

Plain JSON Schema remains runtime-only and therefore produces `unknown` payload
data. Standard Schema inputs such as Zod infer both runtime validation and the
bound resolver overloads.

At runtime, defining `approvalSchema` without `needsApproval: true` throws.
TanStack AI converts the input, output, and selected approval branches to
canonical JSON Schema, embeds their hashes in the protected interrupt binding,
and validates again on resume. See [Interrupts](../../interrupts/overview) for the
full lifecycle.

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TName

`TName` *extends* `string` = `string`

### TNeedsApproval

`TNeedsApproval` *extends* `boolean` = `false`. The literal `true` enables the
approval capability in mapped client interrupt types.

### TApprovalSchema

`TApprovalSchema` *extends* `ApprovalSchemaConfig | undefined` = `undefined`.
This generic is conditionally permitted only when `TNeedsApproval` is `true`.

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
  approvalSchema: {
    approve: z.object({ note: z.string() }),
    reject: z.object({ reason: z.string() }),
  },
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

With `tools: [addToCartTool] as const`, the corresponding bound approval has
branch-specific overloads:

```ts
interrupt.resolveInterrupt(true, {
  editedArgs: { guitarId: 'guitar-2', quantity: 2 },
  payload: { note: 'Reviewed' },
})

interrupt.resolveInterrupt(false, {
  payload: { reason: 'Budget limit' },
})
```
