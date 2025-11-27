---
id: ToolInputAvailableStreamChunk
title: ToolInputAvailableStreamChunk
---

# Interface: ToolInputAvailableStreamChunk

Defined in: [types.ts:334](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L334)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:338](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L338)

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

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:336](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L336)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:337](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L337)

***

### type

```ts
type: "tool-input-available";
```

Defined in: [types.ts:335](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L335)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
