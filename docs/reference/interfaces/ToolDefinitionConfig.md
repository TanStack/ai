---
id: ToolDefinitionConfig
title: ToolDefinitionConfig
---

# Interface: ToolDefinitionConfig\<TInput, TOutput, TName\>

Defined in: [tools/tool-definition.ts:84](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L84)

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

Defined in: [tools/tool-definition.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L90)

***

### inputSchema?

```ts
optional inputSchema: TInput;
```

Defined in: [tools/tool-definition.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L91)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [tools/tool-definition.ts:94](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L94)

***

### name

```ts
name: TName;
```

Defined in: [tools/tool-definition.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L89)

***

### needsApproval?

```ts
optional needsApproval: boolean;
```

Defined in: [tools/tool-definition.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L93)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [tools/tool-definition.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L92)
