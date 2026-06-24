---
'@tanstack/ai-grok': minor
---

Add a `grokVideo` adapter for xAI's Imagine video models. `grok-imagine-video` (v1.0) supports text-to-video and image-to-video; `grok-imagine-video-1.5` is image-to-video only — a text-only prompt is rejected by the API, so the adapter fails fast with a clear error telling you to add a starting-frame image or use `grok-imagine-video`. Image-to-video starting frames are supplied as an `image` prompt part (public URL or base64 data source), with the text part describing the motion. Follows the experimental `generateVideo()` jobs/polling architecture: `createVideoJob` posts to `/v1/videos/generations`, status polling reads `/v1/videos/{request_id}`, and the completed result carries the hosted video URL plus usage (`unitsBilled` seconds and exact `cost` in USD). Sizing uses the aspect-ratio template consistent with the grok-imagine image models (`size: '16:9_720p'` → `aspect_ratio` / `resolution`), and durations are 1–15 integer seconds.
