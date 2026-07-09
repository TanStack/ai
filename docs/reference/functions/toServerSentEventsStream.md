---
id: toServerSentEventsStream
title: toServerSentEventsStream
---

# Function: toServerSentEventsStream()

```ts
function toServerSentEventsStream(
   stream, 
   abortController?, 
getId?): ReadableStream<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/ai/src/stream-to-response.ts:52](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L52)

Convert a StreamChunk async iterable to a ReadableStream in Server-Sent Events format

This creates a ReadableStream that emits chunks in SSE format:
- Each chunk is prefixed with "data: "
- Each chunk is followed by "\n\n"
- Stream ends when the underlying iterable is exhausted (RUN_FINISHED is the terminal event)

## Parameters

### stream

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

AsyncIterable of StreamChunks from chat()

### abortController?

`AbortController`

Optional AbortController to abort when stream is cancelled

### getId?

(`chunk`, `index`) => `string` \| `undefined`

## Returns

`ReadableStream`\<`Uint8Array`\<`ArrayBufferLike`\>\>

ReadableStream in Server-Sent Events format
