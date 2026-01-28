---
id: streamToText
title: streamToText
---

# Function: streamToText()

```ts
function streamToText(stream): Promise<string>;
```

Defined in: [stream-to-response.ts:23](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream-to-response.ts#L23)

Collect all text content from a StreamChunk async iterable and return as a string.

This function consumes the entire stream, accumulating content from 'content' type chunks,
and returns the final concatenated text.

## Parameters

### stream

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>

AsyncIterable of StreamChunks from chat()

## Returns

`Promise`\<`string`\>

Promise<string> - The accumulated text content

## Example

```typescript
const stream = chat({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }]
});
const text = await streamToText(stream);
console.log(text); // "Hello! How can I help you today?"
```
