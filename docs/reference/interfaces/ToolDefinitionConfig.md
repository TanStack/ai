---
id: ToolDefinitionConfig
title: ToolDefinitionConfig
---

# Interface: ToolDefinitionConfig\<TInput, TOutput, TName, TNeedsApproval\>

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L107)

Tool definition configuration

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TName

`TName` *extends* `string` = `string`

### TNeedsApproval

`TNeedsApproval` *extends* `boolean` = `false`

## Properties

### description

```ts
description: string;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L114)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L115)

***

### lazy?

```ts
optional lazy: boolean;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L118)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L119)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:113](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L113)

***

### needsApproval?

```ts
optional needsApproval: TNeedsApproval;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:117](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L117)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:116](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L116)
