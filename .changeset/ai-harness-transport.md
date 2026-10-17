---
'@tanstack/ai-harness': minor
---

Serve a harness session to clients.

- `createHarnessHandler()` from `@tanstack/ai-harness/server` serves a session over HTTP. `POST run` is standard AG-UI, so `useChat` with `fetchServerSentEvents` works on a harness, with approvals, client tools, and a reload that joins the running turn. `POST control`, `GET events`, `GET transcript`, `GET agent-transcript` (the messages of a child agent run), `GET snapshot`, `GET describe`, `sessions`, and the media routes cover the rest.
- `handleHarnessSocket()`, from the same entry, serves the same session over a WebSocket.
- `expose` on `defineHarness()` names the agents, settings, config keys, and commands that a client can use. Any other input of those kinds gets `rejected` with `not_exposed`.
- `createHarnessClient()` from `@tanstack/ai-harness/client` is a typed, browser-safe client. It sends inputs, reads the session, and streams events that resume from a cursor.
- `oauthConnector()` and the OAuth helpers from `@tanstack/ai-harness/oauth` (`loopbackLogin`, `deviceLogin`, `exchangeCode`, `refreshCredential`, and more) keep a credential per sender. `token({ wait: true })` stops the turn with an `auth_required` interrupt until the user signs in.
