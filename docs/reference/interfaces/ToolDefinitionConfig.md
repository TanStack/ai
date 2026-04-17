---
id: ToolDefinitionConfig
title: ToolDefinitionConfig
---

# Interface: ToolDefinitionConfig\<TInput, TOutput, TName\>

Defined in: [activities/chat/tools/tool-definition.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L90)

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

Defined in: [activities/chat/tools/tool-definition.ts:96](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L96)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [activities/chat/tools/tool-definition.ts:97](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L97)

***

### lazy?

```ts
optional lazy: boolean;
```

Defined in: [activities/chat/tools/tool-definition.ts:100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L100)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [activities/chat/tools/tool-definition.ts:101](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L101)

***

### name

```ts
name: TName;
```

Defined in: [activities/chat/tools/tool-definition.ts:95](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L95)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [activities/chat/tools/tool-definition.ts:99](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L99)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [activities/chat/tools/tool-definition.ts:98](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L98)
