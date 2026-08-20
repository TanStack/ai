---
id: ToolCall
title: ToolCall
---

# Interface: ToolCall\<TMetadata\>

Defined in: [packages/ai/src/types.ts:163](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L163)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### function

```ts
function: object;
```

Defined in: [packages/ai/src/types.ts:166](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L166)

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

Defined in: [packages/ai/src/types.ts:164](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L164)

***

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:173](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L173)

Provider-specific metadata to carry through the tool call lifecycle.
Typed per-adapter via `TToolCallMetadata`. For example,
`@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`.

***

### type

```ts
type: "function";
```

Defined in: [packages/ai/src/types.ts:165](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L165)
