---
id: ErrorStreamChunk
title: ErrorStreamChunk
---

# Interface: ErrorStreamChunk

Defined in: [types.ts:684](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L684)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:686](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L686)

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

Defined in: [types.ts:643](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L643)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:644](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L644)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:645](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L645)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "error";
```

Defined in: [types.ts:685](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L685)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
