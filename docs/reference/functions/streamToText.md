---
id: streamToText
title: streamToText
---

```ts
function streamToText(stream): Promise<ChatResult>;
```

Defined in: [packages/ai/src/stream-to-response.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L60)

Read a StreamChunk async iterable to the end and return its text and chunks.

`text` joins the deltas of every TEXT_MESSAGE_CONTENT event. `chunks` keeps
every chunk in order, so tool calls and interrupt outcomes are not lost.

## Parameters

### stream

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

AsyncIterable of StreamChunks from chat()

## Returns

`Promise`\<[`ChatResult`](../interfaces/ChatResult.md)\>

A [ChatResult](../interfaces/ChatResult.md) with the joined text and every chunk.

## Throws

The error from the first RUN_ERROR chunk.

## Example

```typescript
const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Hello!' }]
});
const { text } = await streamToText(stream);
console.log(text); // "Hello! How can I help you today?"
```
