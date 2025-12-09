---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:522](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L522)

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

Defined in: [types.ts:524](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L524)

***

### model

```ts
model: string;
```

Defined in: [types.ts:525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L525)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:526](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L526)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:523](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L523)
