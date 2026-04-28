---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-vue': minor
---

Add a `fetcher` option to `ChatClient` and the framework chat hooks
(`useChat` / `createChat`), mirroring the `fetcher` option on the
generation hooks. Pass either `connection` or `fetcher` — the XOR is
enforced at the type level via `ChatTransport`.

```ts
useChat({
  fetcher: ({ messages }, { signal }) => chatFn({ data: { messages }, signal }),
})
```

The fetcher may return either a `Response` (parsed as SSE) or an
`AsyncIterable<StreamChunk>` (yielded directly). `stream()`,
`fetchServerSentEvents`, `fetchHttpStream`, and `rpcStream` are unchanged.
