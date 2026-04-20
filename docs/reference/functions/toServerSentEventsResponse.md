---
id: toServerSentEventsResponse
title: toServerSentEventsResponse
---

# Function: toServerSentEventsResponse()

```ts
function toServerSentEventsResponse(stream, init?): Response;
```

Defined in: [packages/typescript/ai/src/stream-to-response.ts:122](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream-to-response.ts#L122)

Convert a StreamChunk async iterable to a Response in Server-Sent Events format

This creates a Response that emits chunks in SSE format:
- Each chunk is prefixed with "data: "
- Each chunk is followed by "\n\n"
- Stream ends when the underlying iterable is exhausted (RUN_FINISHED is the terminal event)

## Parameters

### stream

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

AsyncIterable of StreamChunks from chat()

### init?

`ResponseInit` & `object`

Optional Response initialization options (including `abortController`)

## Returns

`Response`

Response in Server-Sent Events format

## Example

```typescript
const stream = chat({ adapter: openaiText(), model: "gpt-4o", messages: [...] });
return toServerSentEventsResponse(stream, { abortController });
```
