---
'@tanstack/ai-grok': patch
---

Video: allow a starting-frame image alongside reference inputs on `grok-imagine-video-1.5`. xAI documents `image` combined with `reference_images` / `reference_audios` as the way to pin the first frame on 1.5; the adapter rejected the combination unconditionally, so the only workaround was to demote the intended first frame into `reference_images[0]`, which does not lock the first frame. Classic `grok-imagine-video` still rejects reference inputs outright.
