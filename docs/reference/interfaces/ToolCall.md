---
id: ToolCall
title: ToolCall
---

# Interface: ToolCall\<TMetadata\>

Defined in: [packages/ai/src/types.ts:153](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L153)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### function

```ts
function: object;
```

Defined in: [packages/ai/src/types.ts:156](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L156)

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

Defined in: [packages/ai/src/types.ts:154](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L154)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:163](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L163)

Provider-specific metadata to carry through the tool call lifecycle.
Typed per-adapter via `TToolCallMetadata`. For example,
`@tanstack/ai-gemini` sets this to `{ thoughtSignature?: string }`.

***

### type

```ts
type: "function";
```

Defined in: [packages/ai/src/types.ts:155](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L155)
