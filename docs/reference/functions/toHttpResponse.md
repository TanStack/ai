---
id: toHttpResponse
title: toHttpResponse
---

# Function: toHttpResponse()

```ts
function toHttpResponse<TOffset>(stream, init?): Response;
```

Defined in: [packages/ai/src/stream-to-response.ts:1118](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L1118)

Convert a StreamChunk async iterable to a Response in HTTP stream format (newline-delimited JSON)

This creates a Response that emits chunks in HTTP stream format:
- Each chunk is JSON.stringify'd and followed by "\n"
- No SSE formatting (no "data: " prefix)

This format is compatible with `fetchHttpStream` connection adapter.

Pass a `durability` sink (`memoryStream(request)` / `durableStream(request)`)
to make the stream resumable: fresh runs are appended to the log and each
NDJSON line is emitted as an `{ id, chunk }` envelope carrying an opaque
offset; a reconnect (native `Last-Event-ID` header) or a `?offset` join
replays from the log without re-running the producer. `batch` controls how
many chunks are buffered per `append` (default 32). This shares the exact
`durableStreamSource` used by `toServerSentEventsResponse` — only the wire
encoding differs.

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Parameters

### stream

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

AsyncIterable of StreamChunks from chat()

### init?

`ResponseInit` & `object`

Optional Response initialization options (including `abortController`, `durability` with its optional `batch`, and `debug`)

## Returns

`Response`

Response in HTTP stream format (newline-delimited JSON)

## Example

```typescript
export async function POST(request: Request) {
  const stream = chat({ adapter: openaiText('gpt-5.5'), messages: [...] });
  return toHttpResponse(stream, { durability: { adapter: memoryStream(request) } });
}
```
