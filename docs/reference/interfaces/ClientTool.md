---
id: ClientTool
title: ClientTool
---

# Interface: ClientTool\<TInput, TOutput, TName\>

Defined in: [tools/tool-factory.ts:18](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-factory.ts#L18)

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

Defined in: [tools/tool-factory.ts:23](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-factory.ts#L23)

***

### description

```ts
description: string;
```

Defined in: [tools/tool-factory.ts:25](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-factory.ts#L25)

***

### execute()?

```ts
optional execute: (args) => output<TOutput> | Promise<output<TOutput>>;
```

Defined in: [tools/tool-factory.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-factory.ts#L30)

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

Defined in: [tools/tool-factory.ts:26](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-factory.ts#L26)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [tools/tool-factory.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-factory.ts#L29)

***

### name

```ts
name: TName;
```

Defined in: [tools/tool-factory.ts:24](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-factory.ts#L24)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [tools/tool-factory.ts:28](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-factory.ts#L28)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [tools/tool-factory.ts:27](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-factory.ts#L27)
