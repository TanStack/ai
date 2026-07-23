---
'@tanstack/ai-client': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
---

Add client-side generation persistence: a lightweight, read-only resume snapshot for media generation activities.

Generation hooks (`useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`, `useGenerateSpeech`, `useGeneration`, `useSummarize`, `useTranscription`, and their Solid/Vue/Svelte/Angular equivalents) now accept a `persistence: { server }` option and an `initialResumeSnapshot`, and expose `resumeSnapshot` / `resumeState` (plus observed `pendingArtifacts` / `resultArtifacts`). As a run streams, the client builds a `GenerationResumeSnapshot` — run identity, status, errors, and result metadata, but **never** the generated media bytes — and writes it to the provided `GenerationServerPersistence` store. On reload the snapshot is surfaced for observability; it exposes no `resume()` action and never restarts provider work — generation still only begins when `generate(...)` is called.

This pairs with the existing `withGenerationPersistence` server middleware, which records run status in the shared `RunStore`.
