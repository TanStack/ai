---
'@tanstack/ai-event-client': minor
'@tanstack/ai-fal': minor
'@tanstack/ai': minor
---

Surface fal's billed cost as `result.usage`. The fal adapters now read fal's `x-fal-billable-units` response header off the result fetch and expose the real billed quantity on the generation result, so consumers can compute exact media-generation cost without wrapping `fetch` themselves.

- `TokenUsage` gains an optional `unitsBilled` field for usage-based (non-token) billing, denominated in the provider's priced unit.
- `falImage`, `falAudio`, `falVideo`, `falSpeech`, and `falTranscription` populate `result.usage.unitsBilled` when fal reports it.
- `VideoUrlResult` gains an optional `usage` slot; `getVideoJobStatus` now emits the `video:usage` event and returns `usage` when the completed result reports billed units.
