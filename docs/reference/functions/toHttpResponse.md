---
id: toHttpResponse
title: toHttpResponse
---

# Function: toHttpResponse()

```ts
function toHttpResponse(stream, init?): Response;
```

Defined in: [stream-to-response.ts:245](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream-to-response.ts#L245)

Convert a StreamChunk async iterable to a Response in HTTP stream format (newline-delimited JSON)

This creates a Response that emits chunks in HTTP stream format:
- Each chunk is JSON.stringify'd and followed by "\n"
- No SSE formatting (no "data: " prefix)

This format is compatible with `fetchHttpStream` connection adapter.

## Parameters

### stream

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>

AsyncIterable of StreamChunks from chat()

### init?

`ResponseInit` & `object`

Optional Response initialization options (including `abortController`)

## Returns

`Response`

Response in HTTP stream format (newline-delimited JSON)

## Example

```typescript
const stream = chat({ adapter: openaiText(), model: "gpt-4o", messages: [...] });
return toHttpResponse(stream, { abortController });
```
