---
id: ToolDefinitionConfig
title: ToolDefinitionConfig
---

# Interface: ToolDefinitionConfig\<TInput, TOutput, TName\>

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L99)

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

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:105](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L105)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L106)

***

### lazy?

```ts
optional lazy: boolean;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:109](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L109)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:110](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L110)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L104)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L108)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L107)
