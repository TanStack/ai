---
id: toServerSentEventsStream
title: toServerSentEventsStream
---

# Function: toServerSentEventsStream()

```ts
function toServerSentEventsStream(stream, abortController?): ReadableStream<Uint8Array<ArrayBufferLike>>;
```

Defined in: [utilities/stream-to-response.ts:22](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utilities/stream-to-response.ts#L22)

Convert a StreamChunk async iterable to a ReadableStream in Server-Sent Events format

This creates a ReadableStream that emits chunks in SSE format:
- Each chunk is prefixed with "data: "
- Each chunk is followed by "\n\n"
- Stream ends with "data: [DONE]\n\n"

## Parameters

### stream

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>

AsyncIterable of StreamChunks from chat()

### abortController?

`AbortController`

Optional AbortController to abort when stream is cancelled

## Returns

`ReadableStream`\<`Uint8Array`\<`ArrayBufferLike`\>\>

ReadableStream in Server-Sent Events format

## Example

```typescript
const stream = chat({ adapter: openai(), model: "gpt-4o", messages: [...] });
const readableStream = toServerSentEventsStream(stream);
// Use with Response, or any API that accepts ReadableStream
```
