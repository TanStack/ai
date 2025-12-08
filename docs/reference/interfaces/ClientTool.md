---
id: ClientTool
title: ClientTool
---

# Interface: ClientTool\<TInput, TOutput, TName\>

Defined in: [tools/tool-definition.ts:23](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L23)

Marker type for client-side tools

## Type Parameters

### TInput

`TInput` *extends* `StandardSchemaV1` = `StandardSchemaV1`

### TOutput

`TOutput` *extends* `StandardSchemaV1` = `StandardSchemaV1`

### TName

`TName` *extends* `string` = `string`

## Properties

### \_\_toolSide

```ts
__toolSide: "client";
```

Defined in: [tools/tool-definition.ts:28](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L28)

***

### description

```ts
description: string;
```

Defined in: [tools/tool-definition.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L30)

***

### execute()?

```ts
optional execute: (args) => InferOutput<TOutput> | Promise<InferOutput<TOutput>>;
```

Defined in: [tools/tool-definition.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L35)

#### Parameters

##### args

`InferOutput`\<`TInput`\>

#### Returns

`InferOutput`\<`TOutput`\> \| `Promise`\<`InferOutput`\<`TOutput`\>\>

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [tools/tool-definition.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L31)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [tools/tool-definition.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L34)

***

### name

```ts
name: TName;
```

Defined in: [tools/tool-definition.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L29)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [tools/tool-definition.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L33)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [tools/tool-definition.ts:32](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L32)
