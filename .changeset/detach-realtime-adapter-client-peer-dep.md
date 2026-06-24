---
'@tanstack/ai': minor
'@tanstack/ai-openai': patch
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-client': patch
---

Move the `RealtimeAdapter` / `RealtimeConnection` contract into `@tanstack/ai` and stop provider adapters from depending on `@tanstack/ai-client`.

Provider packages (`@tanstack/ai-openai`, `@tanstack/ai-elevenlabs`, `@tanstack/ai-grok`) are usable server-side (text, embeddings, images, transcription, token minting, etc.) and must not pull in the client-only `@tanstack/ai-client`. The only thing their realtime adapters needed from it were the `RealtimeAdapter` / `RealtimeConnection` type shapes.

Those two interfaces now live in `@tanstack/ai` — the shared layer that both provider packages and `@tanstack/ai-client` already depend on, and where every other realtime type (`RealtimeToken`, `RealtimeEvent`, `RealtimeSessionConfig`, …) already lives. They're exported from `@tanstack/ai` and `@tanstack/ai/client`. `@tanstack/ai-client` re-exports them unchanged, so `import { RealtimeAdapter } from '@tanstack/ai-client'` keeps working.

As a result `@tanstack/ai-client` is no longer a dependency (peer or otherwise) of any provider package, and the previously-duplicated local contract + drift test in `@tanstack/ai-grok` are removed in favor of the single shared definition. Consumers only need `@tanstack/ai-client` at the point where they actually construct a `RealtimeClient`.
