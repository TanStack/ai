---
id: createReplayStream
title: createReplayStream
---

# Function: createReplayStream()

```ts
function createReplayStream(recording): AsyncIterable<StreamChunk>;
```

Defined in: [activities/chat/stream/processor.ts:1078](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L1078)

Create an async iterable from a recording

## Parameters

### recording

[`ChunkRecording`](../interfaces/ChunkRecording.md)

## Returns

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>
