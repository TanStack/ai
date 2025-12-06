---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:616](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L616)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:621](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L621)

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

Defined in: [types.ts:567](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L567)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:620](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L620)

***

### model

```ts
model: string;
```

Defined in: [types.ts:568](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L568)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:569](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L569)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:618](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L618)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:619](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L619)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:617](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L617)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
