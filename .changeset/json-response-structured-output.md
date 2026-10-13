---
'@tanstack/ai': minor
---

`toJsonResponse` now accepts the object from `chat({ outputSchema })`. It sends the object as a complete structured output, so `useChat` with `fetchJson` shows it as a `structured-output` part. Before this change, the call failed with `Cannot read properties of undefined (reading 'map')`. `toJsonResponse` also awaits a Promise input, so `toJsonResponse(chat({ ... }))` works.
