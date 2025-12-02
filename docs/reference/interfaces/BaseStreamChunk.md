---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:341](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L341)

## Extended by

- [`ContentStreamChunk`](./ContentStreamChunk.md)
- [`ToolCallStreamChunk`](./ToolCallStreamChunk.md)
- [`ToolResultStreamChunk`](./ToolResultStreamChunk.md)
- [`DoneStreamChunk`](./DoneStreamChunk.md)
- [`ErrorStreamChunk`](./ErrorStreamChunk.md)
- [`ApprovalRequestedStreamChunk`](./ApprovalRequestedStreamChunk.md)
- [`ToolInputAvailableStreamChunk`](./ToolInputAvailableStreamChunk.md)
- [`ThinkingStreamChunk`](./ThinkingStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

***

### model

```ts
model: string;
```

Defined in: [types.ts:344](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L344)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:345](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L345)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:342](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L342)
