---
id: toHttpStream
title: toHttpStream
---

# Function: toHttpStream()

```ts
function toHttpStream(stream, abortController?): ReadableStream<Uint8Array<ArrayBufferLike>>;
```

Defined in: [stream-to-response.ts:174](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream-to-response.ts#L174)

Convert a StreamChunk async iterable to a ReadableStream in HTTP stream format (newline-delimited JSON)

This creates a ReadableStream that emits chunks as newline-delimited JSON:
- Each chunk is JSON.stringify'd and followed by "\n"
- No SSE formatting (no "data: " prefix)

This format is compatible with `fetchHttpStream` connection adapter.

## Parameters

### stream

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>

AsyncIterable of StreamChunks from chat()

### abortController?

`AbortController`

Optional AbortController to abort when stream is cancelled

## Returns

`ReadableStream`\<`Uint8Array`\<`ArrayBufferLike`\>\>

ReadableStream in HTTP stream format (newline-delimited JSON)

## Example

```typescript
const stream = chat({ adapter: openaiText(), model: "gpt-4o", messages: [...] });
const readableStream = toHttpStream(stream);
// Use with Response for HTTP streaming (not SSE)
return new Response(readableStream, {
  headers: { 'Content-Type': 'application/x-ndjson' }
});
```
