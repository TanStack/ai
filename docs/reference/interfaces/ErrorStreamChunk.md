---
id: ErrorStreamChunk
title: ErrorStreamChunk
---

# Interface: ErrorStreamChunk

Defined in: [types.ts:553](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L553)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L555)

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

Defined in: [types.ts:512](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L512)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:513](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L513)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:514](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L514)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "error";
```

Defined in: [types.ts:554](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L554)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
