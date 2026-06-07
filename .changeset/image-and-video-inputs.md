---
'@tanstack/ai': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-event-client': patch
---

`generateImage()` and `generateVideo()` now accept a multimodal `prompt`: a plain string, or an ordered array of content parts (`TextPart` / `ImagePart` / `VideoPart` / `AudioPart`) for image-conditioned generation, image-to-image, multi-reference, image-to-video, and edit / inpaint flows. Part order is meaningful — "not like this _(image)_, more like this _(image)_" — and each media part may carry a `metadata.role` hint (`'reference' | 'mask' | 'control' | 'start_frame' | 'end_frame' | 'character'`) that adapters use to route to the provider-specific field, plus an informational `metadata.tag` label for your own bookkeeping. The accepted part types are narrowed per model at compile time via each adapter's input-modality map, so passing an image part to a text-only model is a type error (with a clear runtime throw as backstop).

Prompt text is always sent **verbatim** — the SDK never injects or rewrites in-prompt referencing markers. To reference inputs from your prompt, write the provider's own convention (fal Kling / Seedance `@Image1`, OpenAI / FLUX.2 `"image 1"` prose, Gemini content descriptions); see the image-generation docs for the per-provider table.

Provider behavior in this release:

- **OpenAI image** — Prompts with image parts route `gpt-image-1` / `gpt-image-1-mini` to `images.edit()` (up to 16 source images plus optional mask); `dall-e-2` routes to `images.edit()` with one source image; `dall-e-3` rejects image parts at compile time and at runtime.
- **OpenAI video** — Sora-2 / Sora-2-Pro accept a single image part as `input_reference`; passing more than one throws.
- **Gemini image** — Native models (`gemini-*-flash-image`, "nano-banana") map prompt parts 1:1 onto multimodal `contents`, preserving interleaved order. Imagen is text-only (compile-time + runtime rejection).
- **fal.ai** — Field names resolve per endpoint from a map generated from the fal SDK's endpoint types (362 endpoints with nonstandard fields, e.g. nano-banana edit → `image_urls`, Kling i2v start frame → `image_url`, Veo first-last-frame → `first_frame_url` / `last_frame_url`). Defaults for endpoints not in the map: single → `image_url`, multiple → `image_urls`; `role: 'mask'` → `mask_url`; `role: 'control'` → `control_image_url`; `role: 'reference'` / `'character'` → `reference_image_urls`; video `role: 'start_frame'` / `'end_frame'` → `start_image_url` / `end_image_url`. Per-model prompt modalities are derived at the type level from the SDK's endpoint input types. Regenerate the map after a fal SDK bump with `pnpm generate:fal-image-fields` (a unit test fails when it goes stale).
- **Grok** — New `grok-imagine-image` / `grok-imagine-image-quality` models. Prompts with image parts route to xAI's JSON `/v1/images/edits` endpoint (up to 3 source images, addressed by xAI in request order; the prompt is sent verbatim). `role: 'mask'` / `'control'` throw. Their `size` uses an `aspectRatio_resolution` template (`'16:9_2k'`, suffix optional) mirroring Gemini's native image models. `grok-2-image-1212` remains text-to-image only.
- **OpenRouter** — Prompt parts map 1:1 onto multimodal `text` / `image_url` chat content parts, preserving interleaved order, and are forwarded to the underlying image model. URL sources pass through verbatim (no fetching or re-encoding in your process); `data` sources become data URIs.
- **Anthropic** — Unchanged (no image generation API).

A new `resolveMediaPrompt()` utility (exported from `@tanstack/ai`) is the single downrev point from the canonical interleaved prompt shape to flattened text + per-modality part buckets, for adapter authors.

Closes #618.
