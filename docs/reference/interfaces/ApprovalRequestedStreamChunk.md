---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:337](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L337)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:342](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L342)

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

Defined in: [types.ts:288](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L288)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:341](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L341)

***

### model

```ts
model: string;
```

Defined in: [types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:290](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L290)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:339](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L339)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:340](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L340)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:338](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L338)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
