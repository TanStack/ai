---
id: ToolCall
title: ToolCall
---

# Interface: ToolCall\<TMetadata\>

Defined in: [packages/ai/src/types.ts:150](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L150)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### function

```ts
function: object;
```

Defined in: [packages/ai/src/types.ts:153](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L153)

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

Defined in: [packages/ai/src/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L151)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:160](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L160)

Provider-specific metadata to carry through the tool call lifecycle.
Typed per-adapter via `TToolCallMetadata`. For example,
`@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`.

***

### type

```ts
type: "function";
```

Defined in: [packages/ai/src/types.ts:152](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L152)
