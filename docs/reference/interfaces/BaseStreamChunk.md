---
id: BaseStreamChunk
title: BaseStreamChunk
---

# Interface: BaseStreamChunk

Defined in: [types.ts:515](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L515)

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

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

***

### model

```ts
model: string;
```

Defined in: [types.ts:518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L518)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L519)

***

### type

```ts
type: StreamChunkType;
```

Defined in: [types.ts:516](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L516)
