---
id: ClientTool
title: ClientTool
---

# Interface: ClientTool\<TInput, TOutput, TName\>

Defined in: [tools/tool-definition.ts:18](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L18)

Marker type for client-side tools

## Type Parameters

### TInput

`TInput` *extends* `z.ZodType` = `z.ZodType`

### TOutput

`TOutput` *extends* `z.ZodType` = `z.ZodType`

### TName

`TName` *extends* `string` = `string`

## Properties

### \_\_toolSide

```ts
__toolSide: "client";
```

Defined in: [tools/tool-definition.ts:23](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L23)

***

### description

```ts
description: string;
```

Defined in: [tools/tool-definition.ts:25](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L25)

***

### execute()?

```ts
optional execute: (args) => output<TOutput> | Promise<output<TOutput>>;
```

Defined in: [tools/tool-definition.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L30)

#### Parameters

##### args

`output`\<`TInput`\>

#### Returns

`output`\<`TOutput`\> \| `Promise`\<`output`\<`TOutput`\>\>

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [tools/tool-definition.ts:26](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L26)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [tools/tool-definition.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L29)

***

### name

```ts
name: TName;
```

Defined in: [tools/tool-definition.ts:24](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L24)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [tools/tool-definition.ts:28](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L28)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [tools/tool-definition.ts:27](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L27)
