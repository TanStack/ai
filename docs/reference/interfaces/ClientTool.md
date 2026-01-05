---
id: ClientTool
title: ClientTool
---

# Interface: ClientTool\<TInput, TOutput, TName\>

Defined in: [activities/chat/tools/tool-definition.ts:23](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L23)

Marker type for client-side tools

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = [`SchemaInput`](../type-aliases/SchemaInput.md)

### TName

`TName` *extends* `string` = `string`

## Properties

### \_\_toolSide

```ts
__toolSide: "client";
```

Defined in: [activities/chat/tools/tool-definition.ts:28](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L28)

***

### description

```ts
description: string;
```

Defined in: [activities/chat/tools/tool-definition.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L30)

***

### execute()?

```ts
optional execute: (args) => 
  | InferSchemaType<TOutput>
| Promise<InferSchemaType<TOutput>>;
```

Defined in: [activities/chat/tools/tool-definition.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L35)

#### Parameters

##### args

[`InferSchemaType`](../type-aliases/InferSchemaType.md)\<`TInput`\>

#### Returns

  \| [`InferSchemaType`](../type-aliases/InferSchemaType.md)\<`TOutput`\>
  \| `Promise`\<[`InferSchemaType`](../type-aliases/InferSchemaType.md)\<`TOutput`\>\>

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [activities/chat/tools/tool-definition.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L31)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [activities/chat/tools/tool-definition.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L34)

***

### name

```ts
name: TName;
```

Defined in: [activities/chat/tools/tool-definition.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L29)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [activities/chat/tools/tool-definition.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L33)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [activities/chat/tools/tool-definition.ts:32](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L32)
