---
id: ErrorStreamChunk
title: ErrorStreamChunk
---

# Interface: ErrorStreamChunk

Defined in: [types.ts:315](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L315)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:317](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L317)

#### code?

```ts
optional code: string;
```

#### message

```ts
message: string;
```

***

### id

```ts
id: string;
```

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:275](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L275)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:276](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L276)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "error";
```

Defined in: [types.ts:316](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L316)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
