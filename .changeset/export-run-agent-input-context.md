---
'@tanstack/ai-client': patch
'@tanstack/ai-react': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-preact': patch
---

Expose the connection adapter primitives needed to build custom
transports from every framework hook package. `@tanstack/ai-client`
now re-exports `RunAgentInputContext` at its entry point, and
`@tanstack/ai-react`, `@tanstack/ai-vue`, `@tanstack/ai-solid`,
`@tanstack/ai-svelte`, and `@tanstack/ai-preact` now re-export
`rpcStream`, `ConnectConnectionAdapter`, `SubscribeConnectionAdapter`,
and `RunAgentInputContext` alongside the existing `stream`,
`fetchServerSentEvents`, and `fetchHttpStream` re-exports.

Previously, authors of WebSocket / persistent or RPC-backed adapters
had to import these symbols from `@tanstack/ai-client` even though
they were already pulling `useChat` from a framework package. No
runtime change.
