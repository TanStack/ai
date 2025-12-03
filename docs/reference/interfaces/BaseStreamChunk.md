---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:510](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L510)

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

Defined in: [types.ts:512](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L512)

***

### model

```ts
model: string;
```

Defined in: [types.ts:513](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L513)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:514](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L514)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:511](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L511)
