---
id: ToolInputAvailableStreamChunk
title: ToolInputAvailableStreamChunk
---

# Interface: ToolInputAvailableStreamChunk

Defined in: [types.ts:584](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L584)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:524](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L524)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:588](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L588)

***

### model

```ts
model: string;
```

Defined in: [types.ts:525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L525)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:526](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L526)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:586](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L586)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:587](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L587)

***

### type

```ts
type: "tool-input-available";
```

Defined in: [types.ts:585](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L585)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
