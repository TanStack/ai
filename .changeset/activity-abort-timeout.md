---
'@tanstack/ai': minor
'@tanstack/ai-fal': minor
---

feat(ai): add `timeout` and `abortSignal` to media generation activities

Media activities (`generateImage`, `generateAudio`, `generateVideo`, `generateSpeech`, `generateTranscription`, and `summarize`) now accept optional `timeout` and `abortSignal`. Core composes them into a request-specific effective signal, races the adapter call so hung providers reject, clears timeout resources on settle, and routes aborts to middleware `onAbort` (not `onError`).

`@tanstack/ai-fal` forwards the signal to `fal.subscribe()` / `fal.queue.submit()` per request — never via global `fal.config()` — so concurrent generations stay isolated.
