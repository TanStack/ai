---
id: ToolCall
title: ToolCall
---

# Interface: ToolCall\<TMetadata\>

Defined in: [packages/ai/src/types.ts:166](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L166)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### function

```ts
function: object;
```

Defined in: [packages/ai/src/types.ts:169](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L169)

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

Defined in: [packages/ai/src/types.ts:167](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L167)

***

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:176](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L176)

Provider-specific metadata to carry through the tool call lifecycle.
Typed per-adapter via `TToolCallMetadata`. For example,
`@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`.

***

### type

```ts
type: "function";
```

Defined in: [packages/ai/src/types.ts:168](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L168)
