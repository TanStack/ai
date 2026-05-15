---
id: ToolCall
title: ToolCall
---

# Interface: ToolCall\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:114](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L114)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### function

```ts
function: object;
```

Defined in: [packages/typescript/ai/src/types.ts:117](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L117)

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

Defined in: [packages/typescript/ai/src/types.ts:115](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L115)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/typescript/ai/src/types.ts:124](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L124)

Provider-specific metadata to carry through the tool call lifecycle.
Typed per-adapter via `TToolCallMetadata`. For example,
`@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`.

***

### type

```ts
type: "function";
```

Defined in: [packages/typescript/ai/src/types.ts:116](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L116)
