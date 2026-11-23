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
