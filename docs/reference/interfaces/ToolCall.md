---
id: ToolCall
title: ToolCall
---

# Interface: ToolCall\<TMetadata\>

Defined in: [packages/ai/src/types.ts:148](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L148)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### function

```ts
function: object;
```

Defined in: [packages/ai/src/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L151)

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

Defined in: [packages/ai/src/types.ts:149](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L149)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:158](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L158)

Provider-specific metadata to carry through the tool call lifecycle.
Typed per-adapter via `TToolCallMetadata`. For example,
`@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`.

***

### type

```ts
type: "function";
```

Defined in: [packages/ai/src/types.ts:150](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L150)
