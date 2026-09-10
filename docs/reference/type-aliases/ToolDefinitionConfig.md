---
id: ToolDefinitionConfig
title: ToolDefinitionConfig
---

# Type Alias: ToolDefinitionConfig\<TInput, TOutput, TName, TNeedsApproval, TApprovalSchema\>

```ts
type ToolDefinitionConfig<TInput, TOutput, TName, TNeedsApproval, TApprovalSchema> = object & ApprovalConfig<TNeedsApproval, TApprovalSchema>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:211](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L211)

Tool definition configuration

## Type Declaration

### description

```ts
description: string;
```

### inputSchema?

```ts
optional inputSchema?: TInput;
```

### lazy?

```ts
optional lazy?: boolean;
```

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

### name

```ts
name: TName;
```

### outputSchema?

```ts
optional outputSchema?: TOutput;
```

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](SchemaInput.md) \| `undefined` = `undefined`

### TOutput

`TOutput` *extends* [`SchemaInput`](SchemaInput.md) \| `undefined` = `undefined`

### TName

`TName` *extends* `string` = `string`

### TNeedsApproval

`TNeedsApproval` *extends* `boolean` = `false`

### TApprovalSchema

`TApprovalSchema` *extends* [`ApprovalSchemaConfig`](ApprovalSchemaConfig.md) \| `undefined` = `undefined`
