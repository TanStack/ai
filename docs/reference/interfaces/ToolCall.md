---
id: ToolCall
title: ToolCall
---

# Interface: ToolCall\<TMetadata\>

Defined in: [packages/ai/src/types.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L138)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### function

```ts
function: object;
```

Defined in: [packages/ai/src/types.ts:141](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L141)

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

Defined in: [packages/ai/src/types.ts:139](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L139)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:148](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L148)

Provider-specific metadata to carry through the tool call lifecycle.
Typed per-adapter via `TToolCallMetadata`. For example,
`@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`.

***

### type

```ts
type: "function";
```

Defined in: [packages/ai/src/types.ts:140](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L140)
