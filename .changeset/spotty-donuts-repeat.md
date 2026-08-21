---
'@tanstack/ai-client': minor
---

Add `body` to `SendMessageOptions`: a per-call body shallow-merged into the request's `forwardedProps` with the highest priority.

`ChatClient.sendMessage` already accepted a per-call body as its positional second argument, but the framework hooks (`useChat`, `injectChat`, `createChat`, …) expose `sendMessage(content, options)` and forwarded `undefined` for it — leaving no race-free way to send per-message data (e.g. attachment ids) through a hook. Updating a reactive chat-level `body`/`forwardedProps` option right before sending is racy because reactive option changes can flush after the send.

`sendMessage(content, { body: { ... } })` now works through every framework hook. On `ChatClient` directly, pass it as the third argument — `sendMessage(content, undefined, { body: { ... } })` — or keep using the positional second argument, which wins if both are provided. Queued sends preserve their per-call `body` exactly like the positional form.
