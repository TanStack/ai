---
'@tanstack/ai-gemini': minor
---

Add the GA Gemini native image model ids and give each native image model its own size type.

`gemini-3.1-flash-image-preview` and `gemini-3-pro-image-preview` were shut down on 2026-06-25 and now 404. Their GA replacements — `gemini-3.1-flash-image` and `gemini-3-pro-image` — are now the primary ids. The `-preview` ids remain in the model union as aliases so existing code keeps compiling; `gemini-2.5-flash-image` stays fully supported ahead of its 2026-10-02 shutdown.

Sizes were a single flat union (`{8 ratios}_{1K|2K|4K}`) applied to every native model. Google documents four different sets, so each model now maps to its own:

| model                                   | aspect ratios | resolutions                      |
| --------------------------------------- | ------------- | -------------------------------- |
| `gemini-3.1-flash-image` (+ `-preview`) | 14            | `512` `1K` `2K` `4K`             |
| `gemini-3.1-flash-lite-image`           | 14            | `1K`                             |
| `gemini-3-pro-image` (+ `-preview`)     | 10            | `1K` `2K` `4K`                   |
| `gemini-2.5-flash-image`                | 10            | none — bare ratio, e.g. `'16:9'` |

`4:5` and `5:4` are now accepted on every native model (Google lists them for all four; the old union omitted them). `9:21` is deliberately still rejected — it exists on Vertex/Cloud only and the Gemini API rejects it.

**Runtime behaviour changes in two places.** The rest of the change is types-only, but these two are real wire-format deltas:

- `parseNativeImageSize()` now accepts a bare aspect ratio. Previously `'16:9'` failed to parse, so the adapter omitted `imageConfig` entirely and the model picked its own aspect ratio; it now parses to `{ aspectRatio: '16:9' }` and the adapter sends `imageConfig.aspectRatio = '16:9'`. A JavaScript caller — or a TypeScript caller whose `size` is computed at runtime and widened to `string` — that already passed a bare ratio will get a differently-framed image after upgrading, with no compile or runtime error.
- Migrating a `gemini-2.5-flash-image` call from `'16:9_1K'` to the now-required bare `'16:9'` drops `imageSize` from the `generateContent` request. That is intended: Google publishes no `image_size` value or default for this model, so the adapter no longer guesses a tier the API never documented.

**BREAKING (types only):** size combinations the selected model never supported no longer compile. No model id was removed.

- `gemini-3.1-flash-lite-image`: `2K` and `4K` are rejected (the model only emits 1K). Use `'<ratio>_1K'`.
- `gemini-3-pro-image` / `gemini-3-pro-image-preview`: the extreme banner ratios `1:4` `4:1` `1:8` `8:1` are rejected (Gemini 3.1 Flash Image only), as is the `512` tier.
- `gemini-2.5-flash-image`: any `_1K` / `_2K` / `_4K` suffix is rejected — pass the bare ratio (`'16:9'`, not `'16:9_1K'`) — as are the four extreme banner ratios.
- `GeminiNativeImageSize` is now the union of the per-model types rather than one flat template literal. It was not previously reachable from the package entry point, so this is a new export rather than a changed one.

**New type exports**, so the per-model narrowing is nameable and not just inferred at the call site: `GeminiImageModelSizeByName`, `GeminiStandardImageAspectRatio`, `GeminiExtendedImageAspectRatio`, `Gemini31FlashImageSize`, `Gemini31FlashLiteImageSize`, `Gemini3ProImageSize`, `Gemini25FlashImageSize`, `GeminiNativeImageSize`.

**Two caveats worth knowing before you rely on this.**

- _No in-editor deprecation warning on the dead `-preview` ids._ The `@deprecated` tags live on module-private model-metadata consts, and `GeminiImageModels` is projected out of a const array (`(typeof GEMINI_IMAGE_MODELS)[number]`), which collapses to bare string literals — JSDoc does not survive that projection. So `geminiImage('gemini-3-pro-image-preview')` still compiles cleanly with no strikethrough and no hint, and fails only at request time. Grep your codebase for `-image-preview` rather than expecting the compiler to flag it.
- _`gemini-3.1-flash-lite-image`'s four extreme ratios (`1:4` `4:1` `1:8` `8:1`) are partially inferred._ Unlike the other three native models, Flash Lite has no per-model ratio table on the Gemini API guide. The 14-value set rests on the Cloud model page's explicit enumeration plus `ai.google.dev`'s bare "a discrete set of 14 aspect ratios" assertion; the only Gemini-API enumeration for this model is a 10-item bullet prefixed "New aspect ratios", read here as a what's-new list rather than an exhaustive set. If the API rejects those four in practice, this type over-accepts and should narrow to the 10-ratio set.
