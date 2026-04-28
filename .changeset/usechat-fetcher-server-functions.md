---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
---

Add a `fetcher` option to `ChatClient` and `useChat`, mirroring the
`fetcher` option on the generation hooks. Pass either `connection` or
`fetcher` — the XOR is enforced at the type level via `ChatTransport`.

```ts
useChat({
  fetcher: ({ messages }, { signal }) => chatFn({ data: { messages }, signal }),
})
```

The fetcher may return either a `Response` (parsed as SSE) or an
`AsyncIterable<StreamChunk>` (yielded directly). `stream()`,
`fetchServerSentEvents`, `fetchHttpStream`, and `rpcStream` are unchanged.
