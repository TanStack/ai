---
'@tanstack/ai-ui-message-stream': minor
'@tanstack/ai-client': patch
'@tanstack/ai-react': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-angular': patch
'@tanstack/ai-remix': patch
'@tanstack/ai-octane': patch
---

TanStack `useChat` gets more from an AI SDK route through `fromChatTransport`:

- Client tools go to the route in the request body. Read them on the route with `clientToolsFromAISDKBody(body, serverTools)`, so the route needs no copy.
- With `outputSchema`, an `Output.object` answer is a typed `structured-output` part with partial objects.
- A dropped stream reconnects with the backoff of the TanStack HTTP connections. Set it with the `reconnect` option.
- The connection reads `threadId`, `tools` and `outputSchema` from `useChat`. Do not pass them to `fromChatTransport`.

`@tanstack/ai-client` exports `createReconnectTracker` and its `ReconnectTracker` type. A connection now gets the chat config of the run as `runContext.config`, and `joinRun` gets it as its third argument (`ChatRunConfig`: `threadId`, `tools`, `outputSchema`). `ChatClient` takes an `outputSchema` option, and each chat hook passes its `outputSchema` to it.
