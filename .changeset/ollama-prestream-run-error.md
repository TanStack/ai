---
'@tanstack/ai-ollama': patch
---

Emit a `RUN_ERROR` event instead of throwing when the Ollama text adapter's `chatStream` fails before streaming begins (e.g. the initial `client.chat` call is rejected because the host is unreachable). The error is now surfaced as a structured chunk — with `message`, `code`, and any available `rawEvent` — so failures flow through the stream consistently with other adapters rather than escaping as an unhandled exception.
