---
'@tanstack/ai': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-grok': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-event-client': patch
---

Add `imageInputs`, `videoInputs`, and `audioInputs` to `generateImage()` and `generateVideo()` for image-conditioned generation, image-to-image, multi-reference, image-to-video, and edit / inpaint flows. Each input part may carry a `metadata.role` hint (`'reference' | 'mask' | 'control' | 'start_frame' | 'end_frame' | 'character'`) that adapters use to route to the provider-specific field.

Provider behavior in this release:

- **OpenAI image** — `gpt-image-1` / `gpt-image-1-mini` route to `images.edit()` (up to 16 source images plus optional mask); `dall-e-2` routes to `images.edit()` with one source image; `dall-e-3` throws a clear not-supported error.
- **OpenAI video** — Sora-2 / Sora-2-Pro accept a single `input_reference` image; passing more than one throws.
- **Gemini image** — Native models (`gemini-*-flash-image`, "nano-banana") receive inputs as multimodal parts in `contents`. Imagen throws (text-only).
- **fal.ai** — Field names resolve per endpoint from a map generated from the fal SDK's endpoint types (362 endpoints with nonstandard fields, e.g. nano-banana edit → `image_urls`, Kling i2v start frame → `image_url`, Veo first-last-frame → `first_frame_url` / `last_frame_url`). Defaults for endpoints not in the map: single → `image_url`, multiple → `image_urls`; `role: 'mask'` → `mask_url`; `role: 'control'` → `control_image_url`; `role: 'reference'` / `'character'` → `reference_image_urls`; video `role: 'start_frame'` / `'end_frame'` → `start_image_url` / `end_image_url`. Regenerate the map after a fal SDK bump with `pnpm generate:fal-image-fields` (a unit test fails when it goes stale).
- **Grok**, **OpenRouter** — Throw with a link to issue #618 (full support pending dedicated Imagine / multimodal injection work).
- **Anthropic** — Unchanged (no image generation API).

Closes #618.
