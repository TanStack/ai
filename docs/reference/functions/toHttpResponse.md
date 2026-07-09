---
id: toHttpResponse
title: toHttpResponse
---

# Function: toHttpResponse()

```ts
function toHttpResponse(stream, init?): Response;
```

Defined in: [packages/ai/src/stream-to-response.ts:412](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L412)

Convert a StreamChunk async iterable to a Response in HTTP stream format (newline-delimited JSON)

This creates a Response that emits chunks in HTTP stream format:
- Each chunk is JSON.stringify'd and followed by "\n"
- No SSE formatting (no "data: " prefix)

This format is compatible with `fetchHttpStream` connection adapter.

Pass a `durability` sink to make the stream resumable (same semantics as
[toServerSentEventsResponse](toServerSentEventsResponse.md)); ndjson carries no `id:` line, so this
relies on the `?offset` query param rather than native `Last-Event-ID`.

## Parameters

### stream

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

AsyncIterable of StreamChunks from chat()

### init?

`ResponseInit` & `object`

Optional Response initialization options (including `abortController`, `durability`, `batch`)

## Returns

`Response`

Response in HTTP stream format (newline-delimited JSON)

## Example

```typescript
const stream = chat({ adapter: openaiText(), model: "gpt-5.5", messages: [...] });
return toHttpResponse(stream, { durability: memoryStream(request) });
```
