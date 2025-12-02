---
id: ApprovalRequestedStreamChunk
title: ApprovalRequestedStreamChunk
---

# Interface: ApprovalRequestedStreamChunk

Defined in: [types.ts:392](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L392)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### approval

```ts
approval: object;
```

Defined in: [types.ts:397](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L397)

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

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:396](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L396)

***

### model

```ts
model: string;
```

Defined in: [types.ts:344](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L344)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:345](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L345)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:394](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L394)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:395](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L395)

***

### type

```ts
type: "approval-requested";
```

Defined in: [types.ts:393](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L393)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
