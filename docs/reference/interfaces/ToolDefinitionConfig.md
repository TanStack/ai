---
id: ToolDefinitionConfig
title: ToolDefinitionConfig
---

# Interface: ToolDefinitionConfig\<TInput, TOutput, TName\>

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:95](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L95)

Tool definition configuration

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TName

`TName` *extends* `string` = `string`

## Properties

### description

```ts
description: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:101](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L101)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:102](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L102)

***

### lazy?

```ts
optional lazy: boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L105)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:106](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L106)

***

### name

```ts
name: TName;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L100)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:104](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L104)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L103)
