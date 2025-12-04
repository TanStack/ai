---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:566](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L566)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:571](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L571)

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

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:570](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L570)

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

Defined in: [types.ts:568](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L568)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:569](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L569)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:567](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L567)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
