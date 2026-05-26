---
id: ToolCall
title: ToolCall
---

# Interface: ToolCall\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:136](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L136)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### function

```ts
function: object;
```

Defined in: [packages/typescript/ai/src/types.ts:139](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L139)

#### arguments

```ts
arguments: string;
```

#### name

```ts
name: string;
```

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:137](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L137)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/typescript/ai/src/types.ts:146](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L146)

Provider-specific metadata to carry through the tool call lifecycle.
Typed per-adapter via `TToolCallMetadata`. For example,
`@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`.

***

### type

```ts
type: "function";
```

Defined in: [packages/typescript/ai/src/types.ts:138](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L138)
