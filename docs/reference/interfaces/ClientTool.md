---
id: ClientTool
title: ClientTool
---

# Interface: ClientTool\<TInput, TOutput, TName, TContext\>

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

## Properties

### \_\_toolSide

```ts
__toolSide: "client";
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:30](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L30)

***

### description

```ts
description: string;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:32](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L32)

***

### execute?

```ts
optional execute: ToolExecuteFunction<TInput, TOutput, TContext>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:43](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L43)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L38)

***

### lazy?

```ts
optional lazy: boolean;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L41)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L42)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:31](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L31)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:40](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L40)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:39](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L39)
