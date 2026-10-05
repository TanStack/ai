---
'@tanstack/ai-client': patch
---

Send one hydrate `GET` when a chat with `persistence: true` mounts in React Strict Mode. Strict Mode attaches, detaches and attaches the client again in dev, and each attach sent its own `GET`. A re-attach now reuses the `GET` that is still in flight.
