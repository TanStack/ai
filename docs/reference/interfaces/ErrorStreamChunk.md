---
id: ErrorStreamChunk
title: ErrorStreamChunk
---

# Interface: ErrorStreamChunk

Defined in: [types.ts:608](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L608)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:610](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L610)

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

Defined in: [types.ts:567](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L567)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:568](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L568)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:569](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L569)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "error";
```

Defined in: [types.ts:609](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L609)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
