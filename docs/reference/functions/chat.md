---
id: chat
title: chat
---

# Function: chat()

```ts
function chat<TAdapter, TModel>(options): AsyncIterable<StreamChunk>;
```

Defined in: [core/chat.ts:741](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/core/chat.ts#L741)

Standalone chat streaming function with type inference from adapter
Returns an async iterable of StreamChunks for streaming responses
Includes automatic tool execution loop

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `any`, [`DefaultMessageMetadataByModality`](../interfaces/DefaultMessageMetadataByModality.md)\>

### TModel

`TModel` *extends* `any`

## Parameters

### options

[`ChatStreamOptionsForModel`](../type-aliases/ChatStreamOptionsForModel.md)\<`TAdapter`, `TModel`\>

Chat options

## Returns

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>

## Example

```typescript
const stream = chat({
  adapter: openai(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
  tools: [weatherTool], // Optional: auto-executed when called
});

for await (const chunk of stream) {
  if (chunk.type === 'content') {
    console.log(chunk.delta);
  }
}
```
