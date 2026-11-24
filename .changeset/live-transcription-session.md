---
'@tanstack/ai': minor
---

Add `transcriptionSession()`, a live speech-to-text session for the server. Send audio chunks as they arrive (for example from a Twilio call) and iterate `interim`, `final`, `turn-end`, and `error` events. G.711 μ-law and A-law audio is converted to PCM when a provider does not take it, and `createAudioConverter()` is exported for manual conversion. Adapter authors get `openLiveSocket()` from `@tanstack/ai/adapter-internals` and `fakeWebSocket()` from `@tanstack/ai/testing`.
