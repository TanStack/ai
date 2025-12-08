---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:562](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L562)

## Extended by

- [`ContentStreamChunk`](ContentStreamChunk.md)
- [`ToolCallStreamChunk`](ToolCallStreamChunk.md)
- [`ToolResultStreamChunk`](ToolResultStreamChunk.md)
- [`DoneStreamChunk`](DoneStreamChunk.md)
- [`ErrorStreamChunk`](ErrorStreamChunk.md)
- [`ApprovalRequestedStreamChunk`](ApprovalRequestedStreamChunk.md)
- [`ToolInputAvailableStreamChunk`](ToolInputAvailableStreamChunk.md)
- [`ThinkingStreamChunk`](ThinkingStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:564](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L564)

***

### model

```ts
model: string;
```

Defined in: [types.ts:565](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L565)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:566](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L566)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:563](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L563)
