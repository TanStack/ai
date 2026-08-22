---
id: toHttpStream
title: toHttpStream
---

# Function: toHttpStream()

```ts
function toHttpStream(
   stream, 
   abortController?, 
getId?): ReadableStream<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/ai/src/stream-to-response.ts:1049](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L1049)

Convert a StreamChunk async iterable to a ReadableStream in HTTP stream format (newline-delimited JSON)

This creates a ReadableStream that emits chunks as newline-delimited JSON:
- Each chunk is JSON.stringify'd and followed by "\n"
- No SSE formatting (no "data: " prefix)

This format is compatible with `fetchHttpStream` connection adapter.

When `getId` is supplied (delivery durability), each chunk is emitted as an
envelope `{"id":"<offset>","chunk":{…}}` instead of a bare chunk. NDJSON has
no native event-id field like SSE's `id:` line, so the resumable offset rides
inside the payload. Untagged chunks (no id) stay bare, so a non-durable
stream is byte-identical to before and the client auto-detects either form.

## Parameters

### stream

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

AsyncIterable of StreamChunks from chat()

### abortController?

`AbortController`

Optional AbortController to abort when stream is cancelled

### getId?

(`chunk`, `index`) => `string` \| `undefined`

Optional per-chunk durability offset; when present, chunks are envelope-encoded

## Returns

`ReadableStream`\<`Uint8Array`\<`ArrayBufferLike`\>\>

ReadableStream in HTTP stream format (newline-delimited JSON)

## Example

```typescript
const stream = chat({ adapter: openaiText('gpt-5.5'), messages: [...] });
const readableStream = toHttpStream(stream);
// Use with Response for HTTP streaming (not SSE)
return new Response(readableStream, {
  headers: { 'Content-Type': 'application/x-ndjson' }
});
```
