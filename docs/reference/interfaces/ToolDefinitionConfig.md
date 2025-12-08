---
id: ToolDefinitionConfig
title: ToolDefinitionConfig
---

# Interface: ToolDefinitionConfig\<TInput, TOutput, TName\>

Defined in: [tools/tool-definition.ts:83](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L83)

Tool definition configuration

## Type Parameters

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = `z.ZodType`

### TOutput

`TOutput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) = `z.ZodType`

### TName

`TName` *extends* `string` = `string`

## Properties

### description

```ts
description: string;
```

Defined in: [tools/tool-definition.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L89)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [tools/tool-definition.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L90)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [tools/tool-definition.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L93)

***

### name

```ts
name: TName;
```

Defined in: [tools/tool-definition.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L88)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [tools/tool-definition.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L92)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [tools/tool-definition.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L91)
