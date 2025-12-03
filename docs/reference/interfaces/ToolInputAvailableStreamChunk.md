---
id: ToolInputAvailableStreamChunk
title: ToolInputAvailableStreamChunk
---

# Interface: ToolInputAvailableStreamChunk

Defined in: [types.ts:572](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L572)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:512](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L512)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:576](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L576)

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

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:574](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L574)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:575](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L575)

***

### type

```ts
type: "tool-input-available";
```

Defined in: [types.ts:573](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L573)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
