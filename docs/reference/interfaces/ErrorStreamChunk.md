---
id: ErrorStreamChunk
title: ErrorStreamChunk
---

# Interface: ErrorStreamChunk

Defined in: [types.ts:558](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L558)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:560](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L560)

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

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`id`](../BaseStreamChunk#id)

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

### type

```ts
type: "error";
```

Defined in: [types.ts:559](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L559)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk).[`type`](../BaseStreamChunk#type)
