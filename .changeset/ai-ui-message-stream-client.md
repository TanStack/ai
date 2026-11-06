---
'@tanstack/ai-ui-message-stream': minor
'@tanstack/ai-client': patch
---

TanStack `useChat` gets more from an AI SDK route through `fromChatTransport`:

- Client tools go to the route in the request body. Read them on the route with `clientToolsFromAISDKBody(body, serverTools)`, so the route needs no copy.
- With `outputSchema`, an `Output.object` answer is a typed `structured-output` part with partial objects.
- A dropped stream reconnects with the backoff of the TanStack HTTP connections. Set it with the `reconnect` option.

`@tanstack/ai-client` exports `createReconnectTracker` and its `ReconnectTracker` type.
