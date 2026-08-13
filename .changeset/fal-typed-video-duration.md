---
'@tanstack/ai-fal': minor
---

Add per-model typed durations for fal video generation.

`generateVideo({ duration })` is now typed from `@fal-ai/client`'s
`EndpointTypeMap` for the selected model (e.g. `'5' | '10'` on Kling,
`'4s' | '6s' | '8s'` on Veo3). Popular models also implement
`availableDurations()` / `snapDuration()`.

**Breaking:** callers passing `duration: <number>` to fal video models must
either pass the model's duration union directly or call
`adapter.snapDuration(seconds)`.
