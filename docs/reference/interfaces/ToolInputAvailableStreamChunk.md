---
id: ToolInputAvailableStreamChunk
title: ToolInputAvailableStreamChunk
---

# Interface: ToolInputAvailableStreamChunk

Defined in: [types.ts:349](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L349)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:353](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L353)

***

### model

```ts
model: string;
```

Defined in: [types.ts:290](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L290)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:291](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L291)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:351](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L351)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:352](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L352)

***

### type

```ts
type: "tool-input-available";
```

Defined in: [types.ts:350](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L350)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
