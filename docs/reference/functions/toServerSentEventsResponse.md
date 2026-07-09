---
id: toServerSentEventsResponse
title: toServerSentEventsResponse
---

# Function: toServerSentEventsResponse()

```ts
function toServerSentEventsResponse(stream, init?): Response;
```

Defined in: [packages/ai/src/stream-to-response.ts:272](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L272)

Convert a StreamChunk async iterable to a Response in Server-Sent Events format

This creates a Response that emits chunks in SSE format:
- Each chunk is prefixed with "data: "
- Each chunk is followed by "\n\n"
- Stream ends when the underlying iterable is exhausted (RUN_FINISHED is the terminal event)

Pass a `durability` sink (`memoryStream(request)` / `durableStream(request)`)
to make the stream resumable: fresh runs are appended to the log and each SSE
event is tagged with an `id:` offset; a reconnect (native `Last-Event-ID`) or
a `?offset` join replays from the log without re-running the producer. `batch`
controls how many chunks are buffered per `append` (default 32).

## Parameters

### stream

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

AsyncIterable of StreamChunks from chat()

### init?

`ResponseInit` & `object`

Optional Response initialization options (including `abortController`, `durability`, `batch`)

## Returns

`Response`

Response in Server-Sent Events format

## Example

```typescript
const stream = chat({ adapter: openaiText(), model: "gpt-5.5", messages: [...] });
return toServerSentEventsResponse(stream, { durability: memoryStream(request) });
```
