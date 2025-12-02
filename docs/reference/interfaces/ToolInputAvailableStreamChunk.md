---
id: ToolInputAvailableStreamChunk
title: ToolInputAvailableStreamChunk
---

# Interface: ToolInputAvailableStreamChunk

Defined in: [types.ts:403](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L403)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:407](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L407)

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

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:405](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L405)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:406](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L406)

***

### type

```ts
type: "tool-input-available";
```

Defined in: [types.ts:404](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L404)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
