---
id: ToolDefinitionConfig
title: ToolDefinitionConfig
---

# Interface: ToolDefinitionConfig\<TInput, TOutput, TName\>

Defined in: [tools/tool-definition.ts:84](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L84)

Tool definition configuration

## Type Parameters

### TInput

`TInput` *extends* `StandardSchemaV1` = `StandardSchemaV1`

### TOutput

`TOutput` *extends* `StandardSchemaV1` = `StandardSchemaV1`

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

Defined in: [tools/tool-definition.ts:97](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L97)

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

Defined in: [tools/tool-definition.ts:96](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L96)

***

### outputSchema?

```ts
optional outputSchema: TOutput;
```

Defined in: [tools/tool-definition.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L92)

***

### toJsonSchema()?

```ts
optional toJsonSchema: (inputSchema) => Record<string, any> | undefined;
```

Defined in: [tools/tool-definition.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/tool-definition.ts#L93)

#### Parameters

##### inputSchema

`StandardSchemaV1`

#### Returns

`Record`\<`string`, `any`\> \| `undefined`
