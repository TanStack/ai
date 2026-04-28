---
'@tanstack/ai-client': minor
'@tanstack/ai': minor
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

The `stream()` callback's `messages` parameter is now typed as `Array<UIMessage>` (was `Array<UIMessage> | Array<ModelMessage>`) — matching what `useChat`/`ChatClient` actually sends. A runtime assertion guards against misuse. Existing callbacks typed against the union remain assignable (wider declared input satisfies narrower expected input).

`chat()`'s `messages` option now also accepts `Array<UIMessage>` directly, in addition to the existing `Array<ConstrainedModelMessage<…>>`. The runtime already handled both via `convertMessagesToModelMessages`; the public type now matches. This eliminates the `as any` cast previously needed when forwarding `UIMessage[]` from a server-function validator into `chat()`.
