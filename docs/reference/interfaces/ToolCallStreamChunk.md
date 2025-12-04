---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:529](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L529)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`id`](../BaseStreamChunk#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:539](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L539)

***

### model

```ts
model: string;
```

Defined in: [types.ts:518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L518)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`model`](../BaseStreamChunk#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L519)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`timestamp`](../BaseStreamChunk#timestamp)

***

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:531](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L531)

#### function

```ts
function: object;
```

##### function.arguments

```ts
arguments: string;
```

##### function.name

```ts
name: string;
```

#### id

```ts
id: string;
```

#### type

```ts
type: "function";
```

***

### type

```ts
type: "tool_call";
```

Defined in: [types.ts:530](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L530)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk).[`type`](../BaseStreamChunk#type)
