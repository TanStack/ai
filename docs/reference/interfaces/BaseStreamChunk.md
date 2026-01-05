---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:662](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L662)

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

Defined in: [types.ts:664](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L664)

***

### model

```ts
model: string;
```

Defined in: [types.ts:665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L665)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:666](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L666)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:663](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L663)
