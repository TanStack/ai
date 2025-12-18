---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:708](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L708)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:713](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L713)

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

Defined in: [types.ts:659](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L659)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:712](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L712)

***

### model

```ts
model: string;
```

Defined in: [types.ts:660](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L660)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:661](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L661)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:710](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L710)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:711](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L711)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:709](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L709)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
