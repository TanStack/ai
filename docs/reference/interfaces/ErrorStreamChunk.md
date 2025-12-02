---
id: ErrorStreamChunk
title: ErrorStreamChunk
---

# Interface: ErrorStreamChunk

Defined in: [types.ts:384](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L384)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:386](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L386)

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

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:344](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L344)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:345](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L345)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "error";
```

Defined in: [types.ts:385](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L385)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
