---
id: ToolExecuteFunction
title: ToolExecuteFunction
---

# Type Alias: ToolExecuteFunction\<TInput, TOutput, TContext\>

```ts
type ToolExecuteFunction<TInput, TOutput, TContext> = undefined extends TContext ? (args, context?) => 
  | Promise<InferSchemaType<TOutput>>
  | InferSchemaType<TOutput> : (args, context) => 
  | Promise<InferSchemaType<TOutput>>
| InferSchemaType<TOutput>;
```

Defined in: [packages/ai/src/types.ts:514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L514)

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](SchemaInput.md) = [`SchemaInput`](SchemaInput.md)

### TOutput

`TOutput` *extends* [`SchemaInput`](SchemaInput.md) = [`SchemaInput`](SchemaInput.md)

### TContext

`TContext` = `unknown`
