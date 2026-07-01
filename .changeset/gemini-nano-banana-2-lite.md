---
'@tanstack/ai-gemini': minor
---

Add proper support for **Nano Banana 2 Lite** (`gemini-3.1-flash-lite-image`) as a Gemini-native image model. The automated model sync had landed this model mis-classified as a text-only chat model (`output: ['text']`, in `GEMINI_MODELS`); it's now corrected and wired into the image surface — routed through the `generateContent` API with `output: ['text', 'image']`, template-literal sizes (`aspectRatio_resolution`, e.g. `"1:1_2K"`), and image-conditioned prompts, matching the other native image models. Built for ultra-low-latency, low-cost image generation and editing.

Also fixes the OpenRouter model sync (`scripts/sync-provider-models.ts`) so native image models that output both text and image are skipped for manual curation instead of being inserted as chat models.
