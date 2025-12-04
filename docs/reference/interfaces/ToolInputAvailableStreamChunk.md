---
id: ToolInputAvailableStreamChunk
title: ToolInputAvailableStreamChunk
---

# Interface: ToolInputAvailableStreamChunk

Defined in: [types.ts:577](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L577)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`id`](../BaseStreamChunk#id)

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

[`BaseStreamChunk`](../BaseStreamChunk).[`type`](../BaseStreamChunk#type)
