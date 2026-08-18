---
'@tanstack/ai-grok': minor
---

Catch up with the current xAI Imagine / Voice catalog:

- **Image**: add `grok-imagine-image-2.0` (xAI's recommended model, $0.04/image) with its 2.0-only `quality: 'low' | 'medium'` provider option.
- **Video**: `grok-imagine-video-1.5` now supports text-to-video (the stale image-to-video-only guard is removed). Reference-to-video lands via image prompt parts with `metadata.role: 'reference'` (→ `reference_images`) and preset voices via `modelOptions.reference_audios` (max 3). Video editing and extension land via a source `video` prompt part plus `modelOptions.mode: 'edit' | 'extend'` (`/v1/videos/edits` / `/v1/videos/extensions`; in extend mode `duration` is the added tail, not the total).
- **Voice**: add `grok-voice-think-fast-2.0` (current recommended) and the `grok-voice-latest` alias to the realtime models; the realtime token and adapter defaults move off the deprecated 1.0 ids to `grok-voice-think-fast-2.0`.
