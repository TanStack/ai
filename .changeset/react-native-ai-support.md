---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-vue': minor
---

Add React Native support for chat clients and framework hooks, including
client-safe streaming utilities and connection adapters that work in mobile
environments.

The `fetcher` option is now available on `ChatClient` and the framework chat
hooks (`useChat` / `createChat`), mirroring the generation hooks. Pass either
`connection` or `fetcher` -- the XOR is enforced at the type level via
`ChatTransport`. Fetchers may return either a `Response` (parsed as SSE) or an
`AsyncIterable<StreamChunk>` (yielded directly).

The client-safe `@tanstack/ai/client` subpath is now public for framework
packages and mobile bundles. `stream()`, `fetchServerSentEvents`,
`fetchHttpStream`, `rpcStream`, `xhrServerSentEvents`, and `xhrHttpStream` are
available from the client package and framework re-exports. React Native docs,
an Expo chat example, and smoke tests are included for the supported mobile
setup.
