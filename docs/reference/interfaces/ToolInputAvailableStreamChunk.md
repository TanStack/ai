---
id: ToolInputAvailableStreamChunk
title: ToolInputAvailableStreamChunk
---

# Interface: ToolInputAvailableStreamChunk

Defined in: [types.ts:577](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L577)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:581](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L581)

***

### model

```ts
model: string;
```

Defined in: [types.ts:518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L518)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L519)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:579](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L579)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:580](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L580)

***

### type

```ts
type: "tool-input-available";
```

Defined in: [types.ts:578](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L578)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
