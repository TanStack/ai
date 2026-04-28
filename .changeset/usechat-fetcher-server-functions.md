---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
---

Add a `fetcher` option to `ChatClient` and `useChat`, mirroring the
`fetcher` option already on the multimedia hooks (`useGenerateSpeech`,
`useSummarize`, `useTranscription`, `useGenerateImage`).

Pass either `connection` (a `ConnectionAdapter` — `fetchServerSentEvents`,
`fetchHttpStream`, `rpcStream`, or your own) **or** `fetcher` (a direct
async function — typically a TanStack Start server function). The XOR is
enforced by the constructor signature.

```ts
// Server function returns toServerSentEventsResponse(chat({ ... })) — Response
useChat({
  fetcher: ({ messages }, { signal }) =>
    chatFn({ data: { messages }, signal }),
})
```

The fetcher may return either a `Response` (parsed as SSE) or an
`AsyncIterable<StreamChunk>` (yielded directly). The previous `stream()`
connection-adapter helper has been removed; the fetcher path replaces it.

`fetchServerSentEvents`, `fetchHttpStream`, and `rpcStream` are unchanged.
