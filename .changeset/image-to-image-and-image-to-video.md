---
'@tanstack/ai': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-client': minor
'@tanstack/ai-event-client': minor
---

Add `inputImages` to `generateImage()` and `generateVideo()` for image-to-image,
image-to-video, and multi-image composition.

Reference images are passed as the existing `ImagePart` shape, so the same
multimodal type used for chat input is reused for generation input.

Provider/model support:

- OpenAI image: `gpt-image-1`, `gpt-image-1-mini`, `dall-e-2` (single
  reference) — routed to `images.edit`. `dall-e-3` throws (no edit endpoint).
- OpenAI video: `sora-2`, `sora-2-pro` — passed as `input_reference`.
- Gemini image: Nano Banana models accept reference images via
  `generateContent`. Imagen models throw.
- Other providers throw at call time when `inputImages` is supplied.
