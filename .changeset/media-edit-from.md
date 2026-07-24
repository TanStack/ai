---
'@tanstack/ai': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-client': minor
---

feat: first-class follow-up edits for generated media.

`generateVideo({ ..., previousJobId })` edits a previously generated video instead of generating from scratch. Callers always pass the prior generation's job id; adapters decide how to consume it via a `VideoAdapter` edit-kind map:

- `'job'` — reference the id server-side (OpenAI Sora 2 / Sora 2 Pro remix; Gemini Omni Flash, which maps `previousJobId` onto the Interactions API's `previous_interaction_id` wire field — that field is omitted from Omni `modelOptions`)
- `'media'` — resolve the finished clip via `getVideoUrl(previousJobId)` (xAI `grok-imagine-video` → `/videos/edits`; fal video-to-video endpoints such as `xai/grok-imagine-video/edit-video` and Seedance 2.0 reference-to-video). Fal generate endpoints with a known edit sibling (e.g. Grok text/image-to-video) resolve on the generate model, then submit to the edit endpoint.

Non-editing models (Veo, `grok-imagine-video-1.5`) reject `previousJobId` at compile time. Sora remix and Grok edits accept only a prompt — `size` / `duration` / media inputs are rejected because the output inherits them from the source video.

`generateImage({ ..., previousImage })` is the image-side counterpart: pass a prior result's `GeneratedImage` (or an array, or the whole result) and it is prepended to the prompt as an image part, flowing through each adapter's existing edit path; type-gated to models that accept image inputs.

Breaking for hand-rolled (non-`BaseVideoAdapter`) `VideoAdapter` implementations: the interface gains `supportedEditKind(): 'job' | 'media' | undefined` (and a 7th, defaulted `TModelEditByName` generic — existing 6-argument instantiations keep compiling). `BaseVideoAdapter` supplies a default returning `undefined`, plus `resolvePreviousJobUrl(previousJobId)`. New exports include `VideoEditKind`, `ModelEditKindByName`, `VideoPreviousJobIdForAdapter`, `ImagePreviousSource`, `ImagePreviousImageForModel`, `generatedImageToImagePart`, `generatedVideoUrlToVideoPart`. Client wire types: `VideoGenerateInput.previousJobId`, `ImageGenerateInput.previousImage`.
