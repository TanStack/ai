---
id: toStreamResponse
title: toStreamResponse
---

# Function: toStreamResponse()

```ts
function toStreamResponse(stream, init?): Response;
```

Defined in: [utilities/stream-to-response.ts:102](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utilities/stream-to-response.ts#L102)

Create a streaming HTTP response from a StreamChunk async iterable
Includes proper headers for Server-Sent Events

## Parameters

### stream

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>

AsyncIterable of StreamChunks from chat()

### init?

`ResponseInit` & `object`

Optional Response initialization options

## Returns

`Response`

Response object with SSE headers and streaming body

## Example

```typescript
export async function POST(request: Request) {
  const { messages } = await request.json();
  const abortController = new AbortController();
  const stream = chat({
    adapter: openai(),
    model: "gpt-4o",
    messages,
    options: { abortSignal: abortController.signal }
  });
  return toStreamResponse(stream, undefined, abortController);
}
```
