---
'@tanstack/ai': minor
'@tanstack/ai-gemini': minor
---

Add a Google Veo video adapter (`geminiVideo` / `createGeminiVideo`) and the
per-model typed-duration video contract it is built on (#534, #634).

**`@tanstack/ai`** (additive, non-breaking): `VideoAdapter` /
`BaseVideoAdapter` gain a `TModelDurationByName` generic (defaulting to
`Record<string, number>`, preserving today's `duration?: number` typing for
adapters without a map) plus two introspection methods with safe defaults:

- `availableDurations()` — a `DurationOptions` tagged union
  (`discrete | range | mixed | none`) describing the durations the current
  model accepts. Default: `{ kind: 'none' }`.
- `snapDuration(seconds)` — coerce raw seconds to the closest valid duration
  (`snapToDurationOption` is exported for adapter authors). Default:
  `undefined`.

`generateVideo({ duration })` is now typed per model via
`VideoDurationForAdapter<TAdapter>`.

**`@tanstack/ai-gemini`**: new Veo adapter over the long-running
`:predictLongRunning` operation, supporting `veo-3.1-generate-preview`,
`veo-3.1-fast-generate-preview`, `veo-3.0-generate-001`,
`veo-3.0-fast-generate-001`, and `veo-2.0-generate-001`:

- `geminiVideo('veo-3.0-generate-001')` → `duration?: 4 | 6 | 8`
  (Veo 2: `5 | 6 | 8`); `adapter.snapDuration(7)` → `6`.
- Multimodal prompts: the first un-roled / `'start_frame'` image part
  becomes the input image, `'end_frame'` → `lastFrame`, `'reference'` /
  `'character'` → `referenceImages`.
- `size` takes Veo aspect ratios (`'16:9' | '9:16'`); everything else from
  the SDK's `GenerateVideosConfig` (e.g. `resolution`, `generateAudio`,
  `negativePrompt`) is available through `modelOptions`.
- Responsible-AI filtering is surfaced as a failed job with the filter
  reasons.

Note: Veo result URLs are served by the Gemini Files API and require the
Google API key to download (`x-goog-api-key` header or `key` query
parameter).
