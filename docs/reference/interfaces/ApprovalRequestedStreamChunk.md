---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:645](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L645)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:650](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L650)

#### id

```ts
id: string;
```

#### needsApproval

```ts
needsApproval: true;
```

***

### id

```ts
id: string;
```

Defined in: [types.ts:596](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L596)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:649](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L649)

***

### model

```ts
model: string;
```

Defined in: [types.ts:597](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L597)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:598](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L598)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:647](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L647)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:648](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L648)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:646](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L646)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
