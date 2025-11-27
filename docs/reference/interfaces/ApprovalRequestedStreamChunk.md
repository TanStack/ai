---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:323](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L323)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:328](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L328)

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

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:327](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L327)

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

Defined in: [types.ts:325](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L325)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:326](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L326)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:324](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L324)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
