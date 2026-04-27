---
'@tanstack/ai-client': minor
---

feat(ai-client): support TanStack Start server functions in `stream()` connection adapter

The `stream()` factory now accepts any of three return shapes, so a TanStack Start server function can be wired directly into `useChat`:

- `AsyncIterable<StreamChunk>` — direct in-process stream (existing behavior)
- `Promise<AsyncIterable<StreamChunk>>` — server function returning the chat stream
- `Promise<Response>` — server function returning `toServerSentEventsResponse(stream)`

`rpcStream()` likewise accepts a `Promise<AsyncIterable<StreamChunk>>`.

```ts
const chatFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { messages: Array<UIMessage> }) => data)
  .handler(({ data }) =>
    toServerSentEventsResponse(chat({ adapter, messages: data.messages })),
  )

useChat({ connection: stream((messages) => chatFn({ data: { messages } })) })
```
