---
id: ToolDefinitionConfig
title: ToolDefinitionConfig
---

# Interface: ToolDefinitionConfig\<TInput, TOutput, TName\>

Defined in: [tools/tool-definition.ts:79](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L79)

Tool definition configuration

## Type Parameters

### TInput

`TInput` *extends* `z.ZodType` = `z.ZodType`

### TOutput

`TOutput` *extends* `z.ZodType` = `z.ZodType`

### TName

`TName` *extends* `string` = `string`

## Properties

### description

```ts
description: string;
```

Defined in: [tools/tool-definition.ts:85](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L85)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [tools/tool-definition.ts:86](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L86)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [tools/tool-definition.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L89)

***

### name

```ts
name: TName;
```

Defined in: [tools/tool-definition.ts:84](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L84)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [tools/tool-definition.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L88)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [tools/tool-definition.ts:87](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L87)
