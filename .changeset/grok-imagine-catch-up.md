---
'@tanstack/ai-grok': minor
---

Catch up with the current xAI Imagine / Voice catalog:

- **Image**: add `grok-imagine-image-2.0` (xAI's recommended model, $0.04/image) with its 2.0-only `quality: 'low' | 'medium'` provider option.
- **Video**: `grok-imagine-video-1.5` now supports text-to-video (the stale image-to-video-only guard is removed). Reference-to-video lands via image prompt parts with `metadata.role: 'reference' | 'character'` (→ `reference_images`) and preset voices via `modelOptions.reference_audios` (max 3) — 1.5-only, typed per model and gated at runtime. Image-to-video and reference-to-video cannot be combined. Video editing and extension land on `grok-imagine-video` only, via a source `video` prompt part plus `modelOptions.mode: 'edit' | 'extend'` (`/v1/videos/edits` / `/v1/videos/extensions`; in extend mode `duration` is the added tail, not the total). Because edit/extend outputs inherit the source clip's properties, the adapter rejects `size` / `aspect_ratio` / `resolution` (and `duration` in edit mode) in those modes instead of sending fields the API ignores.
- **Voice**: add `grok-voice-think-fast-2.0` (current recommended) and the `grok-voice-latest` alias to the realtime models; the realtime token and adapter defaults move off the deprecated 1.0 ids to `grok-voice-think-fast-2.0`.
