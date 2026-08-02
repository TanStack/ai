---
id: ClientTool
title: ClientTool
---

# Interface: ClientTool\<TInput, TOutput, TName, TContext, TNeedsApproval\>

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:24](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L24)

Marker type for client-side tools

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TName

`TName` *extends* `string` = `string`

### TContext

`TContext` = `unknown`

### TNeedsApproval

`TNeedsApproval` *extends* `boolean` = `false`

## Properties

### \_\_toolSide

```ts
__toolSide: "client";
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:34](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L34)

***

### description

```ts
description: string;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:36](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L36)

***

### execute?

```ts
optional execute: ToolExecuteFunction<TInput, TOutput, TContext>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:47](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L47)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L42)

***

### lazy?

```ts
optional lazy: boolean;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:45](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L45)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L46)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:35](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L35)

***

### needsApproval?

```ts
optional needsApproval: TNeedsApproval;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:44](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L44)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:43](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L43)
