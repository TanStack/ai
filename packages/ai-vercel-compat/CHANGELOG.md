# @tanstack/ai-vercel-compat

## 0.1.0

### Minor Changes

- [#1893](https://github.com/TanStack/ai/pull/1893) [`56d9f96`](https://github.com/TanStack/ai/commit/56d9f960bae57357cfe0b8e231a9523dc9016c9f) - TanStack `useChat` gets more from an AI SDK route through `fromChatTransport`:
  - Client tools go to the route in the request body. Read them on the route with `clientToolsFromAISDKBody(body, serverTools)`, so the route needs no copy.
  - With `outputSchema`, an `Output.object` answer is a typed `structured-output` part with partial objects.
  - A dropped stream reconnects with the backoff of the TanStack HTTP connections. Set it with the `reconnect` option.
  - The connection reads `threadId`, `tools` and `outputSchema` from `useChat`. Do not pass them to `fromChatTransport`.

  `@tanstack/ai-client` exports `createReconnectTracker` and its `ReconnectTracker` type. A connection now gets the chat config of the run as `runContext.config`, and `joinRun` gets it as its third argument (`ChatRunConfig`: `threadId`, `tools`, `outputSchema`). `ChatClient` takes an `outputSchema` option, and each chat hook passes its `outputSchema` to it.

- [#1893](https://github.com/TanStack/ai/pull/1893) [`56d9f96`](https://github.com/TanStack/ai/commit/56d9f960bae57357cfe0b8e231a9523dc9016c9f) - Add `@tanstack/ai-vercel-compat`, a stop gap for porting an app from the Vercel AI SDK one side at a time. It connects TanStack AI to the AI SDK UI message stream.
  - Serve AI SDK `useChat` from `chat()` with `chatParamsFromAISDKRequest` and `toUIMessageStreamResponse`. `toUIMessageStream` gives the plain stream, to merge or pipe yourself. Use `toResumableUIMessageStreamResponse` and `resumeUIMessageStreamResponse` for `useChat({ resume: true })`.
  - Or keep a plain `chat()` route and convert in the browser: pass `toChatTransport(fetchServerSentEvents('/api/chat'))` as the AI SDK `useChat` transport.
  - Point TanStack `useChat` at an AI SDK route with `fromChatTransport(new DefaultChatTransport({ api }))`.

  Text, reasoning with its signature, tool calls and results, client tools, tool approvals, activity and stream resume cross in both directions. Subagents and shared state go from a TanStack server to an AI SDK client only.

### Patch Changes

- Updated dependencies [[`56d9f96`](https://github.com/TanStack/ai/commit/56d9f960bae57357cfe0b8e231a9523dc9016c9f)]:
  - @tanstack/ai-client@1.2.1
