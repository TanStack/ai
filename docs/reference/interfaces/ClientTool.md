---
id: ClientTool
title: ClientTool
---

# Interface: ClientTool\<TInput, TOutput, TName, TContext\>

Defined in: [tools/tool-definition.ts:20](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L20)

Marker type for client-side tools

## Type Parameters

### TInput

`TInput` *extends* `z.ZodType` = `z.ZodType`

### TOutput

`TOutput` *extends* `z.ZodType` = `z.ZodType`

### TName

`TName` *extends* `string` = `string`

### TContext

`TContext` = `unknown`

## Properties

### \_\_contextType?

```ts
optional __contextType: TContext;
```

Defined in: [tools/tool-definition.ts:27](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L27)

***

### \_\_toolSide

```ts
__toolSide: "client";
```

Defined in: [tools/tool-definition.ts:26](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L26)

***

### description

```ts
description: string;
```

Defined in: [tools/tool-definition.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L29)

***

### execute()?

```ts
optional execute: (args, options) => output<TOutput> | Promise<output<TOutput>>;
```

Defined in: [tools/tool-definition.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L34)

#### Parameters

##### args

`output`\<`TInput`\>

##### options

[`ToolOptions`](ToolOptions.md)\<`TContext`\>

#### Returns

`output`\<`TOutput`\> \| `Promise`\<`output`\<`TOutput`\>\>

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [tools/tool-definition.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L30)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [tools/tool-definition.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L33)

***

### name

```ts
name: TName;
```

Defined in: [tools/tool-definition.ts:28](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L28)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [tools/tool-definition.ts:32](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L32)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [tools/tool-definition.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L31)
