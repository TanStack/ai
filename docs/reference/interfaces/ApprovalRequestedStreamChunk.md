---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:713](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L713)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:718](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L718)

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

Defined in: [types.ts:664](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L664)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:717](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L717)

***

### model

```ts
model: string;
```

Defined in: [types.ts:665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L665)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:666](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L666)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:715](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L715)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:716](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L716)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:714](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L714)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
