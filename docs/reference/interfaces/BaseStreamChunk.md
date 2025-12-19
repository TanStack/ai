---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:641](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L641)

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

Defined in: [types.ts:643](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L643)

***

### model

```ts
model: string;
```

Defined in: [types.ts:644](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L644)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:645](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L645)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:642](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L642)
