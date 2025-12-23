---
id: ErrorStreamChunk
title: ErrorStreamChunk
---

# Interface: ErrorStreamChunk

Defined in: [types.ts:705](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L705)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:707](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L707)

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

Defined in: [types.ts:664](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L664)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L665)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:666](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L666)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "error";
```

Defined in: [types.ts:706](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L706)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
