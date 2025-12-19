---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:692](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L692)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:697](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L697)

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

Defined in: [types.ts:643](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L643)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:696](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L696)

***

### model

```ts
model: string;
```

Defined in: [types.ts:644](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L644)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:645](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L645)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:694](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L694)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:695](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L695)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:693](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L693)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
