---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-react': minor
'@tanstack/ai-remix': minor
'@tanstack/ai-octane': minor
---

Add OpenAI GPT-Live voice (`gpt-live-1` and `gpt-live-1.1`). On the server, `openaiLiveSession()` creates the session. In the browser, `openaiLive()` connects over WebRTC.

GPT-Live has no browser token, so this release adds a relay path:

- `realtimeSession()` in `@tanstack/ai` takes the WebRTC offer from the browser, gives it to a `RealtimeSessionAdapter`, and returns the answer.
- `RealtimeRelayAdapter` (`kind: 'relay'`) is a browser adapter that connects through your server.
- `RealtimeClient`, `useRealtimeChat`, and `createRealtimeChat` take `createSession` in place of `getToken` for a relay adapter.

The options type is now a union of the token form and the relay form. If you read the type of `getToken` from it (for example `UseRealtimeChatOptions['getToken']`), the type now includes `undefined`.

`RealtimeClient.updateSession()` now sends `providerOptions` to the connection. Before, the client kept `providerOptions` but did not send them.

Realtime adapters now get `RealtimeConnectOptions` (`abortSignal`, `autoCapture`) in `connect()`. With `autoCapture: false`, `openaiRealtime()` and `openaiLive()` open the microphone on the first `startAudioCapture()`, not on connect.

`RealtimeClient` sends a tool result only to the connection that asked for it. After a reconnect, a result from the old session is dropped.

`createSession` receives the connect `AbortSignal` as its second argument. Pass it to the session request so a cancelled connect does not open a provider session.
