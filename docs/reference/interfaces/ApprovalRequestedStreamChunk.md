---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:561](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L561)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:566](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L566)

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

Defined in: [types.ts:512](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L512)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:565](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L565)

***

### model

```ts
model: string;
```

Defined in: [types.ts:513](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L513)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:514](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L514)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:563](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L563)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:564](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L564)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:562](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L562)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
