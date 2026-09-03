# @tanstack/ai-gemini

## 0.28.0

### Minor Changes

- [#1301](https://github.com/TanStack/ai/pull/1301) [`307b7ec`](https://github.com/TanStack/ai/commit/307b7ec285e60f4a1b9a6c03345130ec9bb93356) - Add Gemini 3.8 Flash (`gemini-3.8-flash`) with multimodal input, thinking, structured output, caching, built-in tools, and agentic video understanding.

  Limit its thinking levels to low, medium, and high in both the standard and Interactions adapters.

### Patch Changes

- Updated dependencies [[`452d6a4`](https://github.com/TanStack/ai/commit/452d6a405d669d00f2cc82d5725c53dfad8602cc)]:
  - @tanstack/ai@0.52.2

## 0.27.0

### Minor Changes

- [#1294](https://github.com/TanStack/ai/pull/1294) [`4964221`](https://github.com/TanStack/ai/commit/49642217ca1efa521773643036ab9480720ad63a) - Add agentic video understanding to the Gemini text adapter.

  Set `metadata.processing: 'agentic'` on a video content part to route the request through the Gemini Interactions API for multi-pass "agentic" video understanding (GA on `gemini-3.7-flash`, `gemini-3.6-flash`, and `gemini-3.5-flash-lite`). Omit it for the default single-pass `generateContent` sampling. New `uploadGeminiFile()` and `geminiVideoPart()` helpers cover the Files API upload + poll-until-ACTIVE flow, and the three models now carry an `agentic_video` capability.

## 0.26.5

### Patch Changes

- [#1259](https://github.com/TanStack/ai/pull/1259) [`845696b`](https://github.com/TanStack/ai/commit/845696b00dab158821ef12fc6062aa0f93c6e30e) - Send Gemini function tool inputs through `parametersJsonSchema` so complete JSON Schema keywords reach the provider.

- [#1273](https://github.com/TanStack/ai/pull/1273) [`9c9746b`](https://github.com/TanStack/ai/commit/9c9746bd4bbe94198ebd973b12fedfbdb9fdb231) - Add Gemini Omni 1.1 Flash (`gemini-omni-1.1-flash`) as the GA Interactions video model.

  `geminiVideo('gemini-omni-1.1-flash')` uses the existing Interactions video path. `gemini-omni-flash-preview` stays as a deprecated alias until it shuts down on 2026-09-30. Omni `size` is an `aspectRatio_resolution` template (`'16:9'` or `'16:9_1080p'`) that maps onto `response_format.aspect_ratio` and `response_format.resolution` (`360p` | `720p` | `1080p` | `4k`, default 720p). Duration stays 3–10 seconds per call.

- Updated dependencies [[`cfb8454`](https://github.com/TanStack/ai/commit/cfb845469875e1b74def21b9525ee19d68a4abbd)]:
  - @tanstack/ai@0.52.1

## 0.26.4

### Patch Changes

- Updated dependencies [[`49fc54c`](https://github.com/TanStack/ai/commit/49fc54ca0aacf2fc60bb36647a61a23559dda4bc), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7)]:
  - @tanstack/ai@0.52.0

## 0.26.3

### Patch Changes

- Updated dependencies [[`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/ai@0.51.0

## 0.26.2

### Patch Changes

- Updated dependencies [[`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b), [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b)]:
  - @tanstack/ai@0.50.0

## 0.26.1

### Patch Changes

- [#1216](https://github.com/TanStack/ai/pull/1216) [`dbb25bf`](https://github.com/TanStack/ai/commit/dbb25bfb01d3d9660c4bc8becc7c54b81b23f949) - Fix duplicate TOOL_CALL_START/TOOL_CALL_END events when a Gemini stream chunk carries both functionCall parts and finishReason UNEXPECTED_TOOL_CALL. The finish handler re-registered and re-emitted tool calls the per-part loop had already processed, which crashed the chat run with "Duplicate interrupt id in final batch".

- Updated dependencies [[`67ce4e5`](https://github.com/TanStack/ai/commit/67ce4e529c42e64d4591f996c7e3e32458d5dd7c)]:
  - @tanstack/ai@0.49.1

## 0.26.0

### Minor Changes

- [#906](https://github.com/TanStack/ai/pull/906) [`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd) - Add headless BYOK: `defineByok` in `@tanstack/ai-client/byok`, pass `byok` into chat and generation hooks, and read keys on the relay with `getByokKey` from `@tanstack/ai/byok/server`. Provider ids are open slugs (`x-byok-<slug>`). Each adapter exports a `{ id, label, env? }` object (`openaiByok`, …); `id` is required. `env` is the env var name(s) for the relay — names only; the client never reads `process.env`. A wrong key surfaces as the provider's own `401` through the relay, so no client-side key check is needed. OpenRouter PKCE (`@tanstack/ai-openrouter/pkce`) saves the minted key under `openrouterByok.id`.

### Patch Changes

- Updated dependencies [[`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd)]:
  - @tanstack/ai@0.49.0

## 0.25.1

### Patch Changes

- Updated dependencies [[`1c0415b`](https://github.com/TanStack/ai/commit/1c0415bec4bbefcd3abf784d0209af05aca5db46)]:
  - @tanstack/ai@0.48.0

## 0.25.0

### Minor Changes

- [#989](https://github.com/TanStack/ai/pull/989) [`75dbdfa`](https://github.com/TanStack/ai/commit/75dbdfa2fe4141cc240fe74307820fe43bd31e07) - Add `@tanstack/ai-vertex` for Gemini on Vertex AI, and allow the Gemini
  client to start without an API key when Vertex or Enterprise mode is on.

### Patch Changes

- Updated dependencies [[`7c4b73a`](https://github.com/TanStack/ai/commit/7c4b73af5023e7ab7e113121644213c75d611aac), [`87e497f`](https://github.com/TanStack/ai/commit/87e497f2e282c2389579051ec743fa4cc8cf493e), [`c0ba484`](https://github.com/TanStack/ai/commit/c0ba48402a807d6482e1cb36a0cf393d0cd26b2b), [`d34b6c0`](https://github.com/TanStack/ai/commit/d34b6c01fbc9ed83e5dc9bd2725eb05f6b03bfd4)]:
  - @tanstack/ai@0.47.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`5f68cbc`](https://github.com/TanStack/ai/commit/5f68cbccf3621b48dae73cedcb1e59cb4cbe72b4), [`32e62ab`](https://github.com/TanStack/ai/commit/32e62ab8b7dc6a8a13ca3851c8925ab806e08f29)]:
  - @tanstack/ai@0.47.0

## 0.24.1

### Patch Changes

- [#932](https://github.com/TanStack/ai/pull/932) [`3eda66c`](https://github.com/TanStack/ai/commit/3eda66cb132def6346829ba113f315ffdd4edf6b) - Classify Anthropic, Gemini, and OpenAI native tools with stable runtime discriminators so ordinary functions can use the same public names without selecting provider-native behavior. Native tools must come from the adapter factory (`webSearchTool()`, `googleSearchTool()`, and the rest). A reserved `name` alone does not select a native converter. `chat()` throws `DuplicateToolNameError` when a factory tool and a custom function share the same public name.

  Previously the converters picked provider-native behavior by `tool.name`. Tool names are public application identifiers, so a plain function called `web_search`, `google_search`, or `code_execution` was routed into a native converter: it lost its `inputSchema` and was sent as a provider-only payload (and on Anthropic could also flip on `code_execution` / skills beta headers). Native tools are now identified by adapter-owned metadata, which converters strip before building the wire payload, so provider API versions stay confined to the wire converters.

  Also preserves Anthropic `webSearchTool` options (`max_uses`, `allowed_domains`, `blocked_domains`, `user_location`, `cache_control`) on the wire payload.

  Also fixes `googleSearchTool({ searchTypes: … })` being silently dropped on the experimental `geminiTextInteractions()` adapter. The Interactions converter read a snake_case `search_types` array, but the public factory takes the Generate Content shape (`GoogleSearch.searchTypes: { webSearch?, imageSearch? }`), so the field never matched and every request fell back to the provider default of web-search-only. The camelCase config is now translated to the Interactions wire list.

- Updated dependencies [[`41a5d18`](https://github.com/TanStack/ai/commit/41a5d189082331e052e1f2f5e987848501ffd08b), [`4599019`](https://github.com/TanStack/ai/commit/4599019eb02f72562ef155b69b8f61f9d25d187a), [`3eda66c`](https://github.com/TanStack/ai/commit/3eda66cb132def6346829ba113f315ffdd4edf6b), [`ecd12a4`](https://github.com/TanStack/ai/commit/ecd12a408987bc75649c21aada6948282a2a66dd)]:
  - @tanstack/ai@0.46.0

## 0.24.0

### Minor Changes

- [#1104](https://github.com/TanStack/ai/pull/1104) [`a8454a7`](https://github.com/TanStack/ai/commit/a8454a7c90b04e4a68b9b3f26de23ed55d391525) - Add the GA Gemini native image model ids and give each native image model its own size type.

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

- [#1103](https://github.com/TanStack/ai/pull/1103) [`4f02789`](https://github.com/TanStack/ai/commit/4f027898a8e957353c29dcf423e59daa54868aee) - Type Gemini-native image models with their own provider options. `GeminiImageModelProviderOptionsByName` mapped **every** image model to the Imagen-shaped `GeminiImageProviderOptions`, so `modelOptions: { safetySettings, thinkingConfig, imageConfig, systemInstruction }` was a compile error on `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image-preview`, and `gemini-2.5-flash-image` — even though those models are served by `generateContent`, whose `GenerateContentConfig` accepts all of them. The adapter compensated by forwarding only `seed`, silently dropping anything else.

  The map now splits native vs Imagen, mirroring the split already used by `GeminiImageModelSizeByName` and `GeminiImageModelInputModalitiesByName`: native models get the new `GeminiNativeImageProviderOptions` (`seed`, `safetySettings`, `thinkingConfig`, `imageConfig`, `systemInstruction`), Imagen models keep `GeminiImageProviderOptions`. Both API paths now pick their config fields by name — never a wholesale spread — so neither shape's fields can reach the other's endpoint. Runtime routing moves the same way, off a `gemini-` prefix test onto membership in `GEMINI_NATIVE_IMAGE_MODELS`: a `gemini-*` image model not present in that list now routes to `generateImages` instead of `generateContent`, so it fails against that endpoint rather than silently taking the native path.

  `responseModalities` stays a protected adapter default (`['TEXT', 'IMAGE']`) and is deliberately absent from the new type. `modelOptions.imageConfig` merges **over** the `imageConfig` derived from the portable `size` option, per field — passing only `imageConfig.imageSize` keeps the `aspectRatio` that `size` implied. `HarmCategory` and `HarmBlockThreshold` are now re-exported so `safetySettings` can be written without adding `@google/genai` to your own dependencies.

  `GEMINI_NATIVE_IMAGE_MODELS` and `isGeminiNativeImageModel` are exported so callers can read the same list the adapter uses for routing.

  Native `imageConfig` is now `GeminiNativeImageConfig`: only `aspectRatio` and `imageSize`. Other `@google/genai` `ImageConfig` keys type-checked and then threw on the Gemini Developer API.

  **BREAKING (types only):** Imagen fields no longer compile on Gemini-native image models — `aspectRatio`, `negativePrompt`, `personGeneration`, `safetyFilterLevel`, `addWatermark`, `language`, `outputMimeType`, `outputCompressionQuality`, `guidanceScale`, `enhancePrompt`, `includeSafetyAttributes`, `includeRaiReason`, `outputGcsUri`, `labels`. They previously type-checked but were already dropped at runtime (only `seed` was ever forwarded to `generateContent`), so no request behaviour changes. The compiler now reports what was already happening. Migrate `aspectRatio` to the portable `size` option (`'16:9_4K'`) or to `modelOptions.imageConfig`, and drop the rest. Native `imageConfig` also no longer accepts Vertex-only SDK keys such as `personGeneration` and `outputMimeType`. `GeminiImageAdapter.generateImages` (and its `~types.providerOptions`) also widens from `ImageGenerationOptions<GeminiImageProviderOptions>` to `ImageGenerationOptions<GeminiAnyImageProviderOptions>`, which affects code structurally annotated against the old signature.

### Patch Changes

- Updated dependencies [[`d10dfe6`](https://github.com/TanStack/ai/commit/d10dfe6eca788ae52631d45e5599aa0c45e9ba37), [`eda82cc`](https://github.com/TanStack/ai/commit/eda82cc8a86923afd604a663d050c6edfa6b829b), [`c63319e`](https://github.com/TanStack/ai/commit/c63319e34a2ca2f1d56b90addf28784f7c3e13ad), [`b09e010`](https://github.com/TanStack/ai/commit/b09e010b32932c812e65b1e14f6faa2b0e6d5cb8), [`0fb8263`](https://github.com/TanStack/ai/commit/0fb826321c9ba7bd5d8ba0062be2a00b6178726d)]:
  - @tanstack/ai@0.45.0

## 0.23.0

### Minor Changes

- [#1105](https://github.com/TanStack/ai/pull/1105) [`03f0f5d`](https://github.com/TanStack/ai/commit/03f0f5dde47f92219a4e23b2d81f0b631a74b4ec) - Add Gemini 3.7 Flash (`gemini-3.7-flash`) with full multimodal input, thinking, structured output, caching, and the same built-in tools as Gemini 3.6 Flash.

### Patch Changes

- Updated dependencies [[`99fb2b7`](https://github.com/TanStack/ai/commit/99fb2b7b113548b20afa894e014bd03773815a41)]:
  - @tanstack/ai@0.44.1

## 0.22.0

### Minor Changes

- [#926](https://github.com/TanStack/ai/pull/926) [`ee07854`](https://github.com/TanStack/ai/commit/ee07854fd3d2d4bb279e6e4748802f7f9a5a7167) - Add a multimodal `embed()` activity. A single primitive covers one input or a batch — `input` accepts a string, a text part, an image part, or a fused text+image item written as a nested `Array<ContentPart>` (`[textPart, imagePart]`, the same shape chat messages use), one vector per item, with the accepted item types narrowed per model at compile time. Top-level `dimensions` requests Matryoshka output sizes where supported. Results carry `embeddings: [{ vector, index }]` plus `usage` when the provider reports it, and `embed()` participates in generation middleware, debug logging, OTel (`gen_ai.operation.name: embeddings`), and devtools events like every other activity.

  Provider adapters: `openaiEmbedding` (text-embedding-3-small/large), `geminiEmbedding` (gemini-embedding-001), `mistralEmbedding` (mistral-embed, codestral-embed), `ollamaEmbedding` (nomic-embed-text and any local model), `bedrockEmbedding` (Titan Text V2, Titan Multimodal G1 with fused text+image, Cohere Embed v3 on Bedrock), and `@tanstack/ai-cohere`'s `cohereEmbedding` (embed-v4.0, multimodal text+image with required `inputType`).

### Patch Changes

- [#1071](https://github.com/TanStack/ai/pull/1071) [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e) - fix: publish internal dependency ranges as `^x.y.z` instead of exact pins

  Internal dependencies on other TanStack AI packages used `workspace:*` in
  `dependencies` and `peerDependencies`. pnpm rewrites that to an **exact** version
  at publish time, so a released package asked for e.g. `@tanstack/ai-utils@0.4.0`
  rather than `^0.4.0`.

  Two consequences for consumers:
  - **Duplicate copies.** An exact pin cannot dedupe. Installing a newer
    `@tanstack/ai` alongside a package pinned to the previous patch produced two
    copies in the tree, which breaks `instanceof` checks and module-level state,
    and inflates bundles.
  - **Unsatisfiable peers.** An exactly pinned `peerDependency` conflicts the
    moment the internal package ships its next patch, forcing consumers into
    overrides or `--legacy-peer-deps`.

  These fields now use `workspace:^`, which publishes as `^x.y.z`. Every package
  here is still `0.x`, so `^0.43.1` resolves to `0.43.x` only — patches dedupe
  cleanly and no breaking minor is ever pulled in.

  `devDependencies` deliberately keep `workspace:*`: they are never published, and
  `*` correctly means "always build against the local copy".

- Updated dependencies [[`59aa8b5`](https://github.com/TanStack/ai/commit/59aa8b5049549246227c8f2cf736ce50d05205a5), [`ee07854`](https://github.com/TanStack/ai/commit/ee07854fd3d2d4bb279e6e4748802f7f9a5a7167), [`b785cc4`](https://github.com/TanStack/ai/commit/b785cc4ae382fb0e2a337199d192bd9335ac9249), [`47e2464`](https://github.com/TanStack/ai/commit/47e246480d29e2ab5a83ca684e047670e75ba66c), [`dd7ddf1`](https://github.com/TanStack/ai/commit/dd7ddf19283358adfbf61d057321d7daee3ca50d), [`6903978`](https://github.com/TanStack/ai/commit/690397804254dca638961c79b7941555edc52c02), [`fdb791a`](https://github.com/TanStack/ai/commit/fdb791a1c9c8de906eecf76f59743f697621b027), [`7aa4ae9`](https://github.com/TanStack/ai/commit/7aa4ae9d07d21195dd3d62598ac503f1dfdc79e4), [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e)]:
  - @tanstack/ai@0.44.0

## 0.21.0

### Minor Changes

- [#1041](https://github.com/TanStack/ai/pull/1041) [`399b4b1`](https://github.com/TanStack/ai/commit/399b4b1855a5fb93dfc37a2afa71cedb092ac36e) - Add Gemini 3.6 Flash (`gemini-3.6-flash`) and Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`) chat models.

  Both are stable GA text models with full multimodal input, thinking, structured output, batch/caching, and the native combined tools + `responseSchema` path. Tool surface includes code execution, file search, Google Search, Google Maps, and URL context. Computer Use (Preview) is listed for 3.6 Flash (and corrected onto existing 3.5 Flash); 3.5 Flash-Lite does not support Computer Use.

### Patch Changes

- Updated dependencies [[`7499171`](https://github.com/TanStack/ai/commit/74991716aea4d90a5d0363676a1e3349689a48e8)]:
  - @tanstack/ai@0.43.0
  - @tanstack/ai-utils@0.4.0

## 0.20.1

### Patch Changes

- Updated dependencies [[`3e1b510`](https://github.com/TanStack/ai/commit/3e1b510e4fdd2334af468c47b7c37b572805200e)]:
  - @tanstack/ai@0.42.0

## 0.20.0

### Minor Changes

- [#886](https://github.com/TanStack/ai/pull/886) [`de5fbb5`](https://github.com/TanStack/ai/commit/de5fbb52a916826cdc0ef31d18df402cd611b9d4) - Add Gemini Omni Flash (`gemini-omni-flash-preview`) video generation via the Interactions API. Omni only serves the Interactions API (`generateContent` rejects it), so the video adapter now routes by model: Veo models keep the `:predictLongRunning` operations flow, while `geminiVideo('gemini-omni-flash-preview')` creates a background interaction with `response_modalities: ['video']`, polls it by id, and returns the inline base64 MP4 as a `data:` URL (Files-API URI delivery passes through). Usage is mapped from the interaction's `output_tokens_by_modality`. Image and video prompt parts are sent as interaction content blocks, and `modelOptions.previous_interaction_id` chains a new prompt onto a prior Omni generation for conversational video editing. The top-level `size` option maps onto `response_format.aspect_ratio` (`'16:9' | '9:16'`) and `duration` onto `response_format.duration` — any value in the 3–10 second range (fractional seconds included, verified against the live API), defaulting to a 10-second clip when omitted. Raises the `@google/genai` floor to `^2.10.0` for the Interactions API surface.

- [#908](https://github.com/TanStack/ai/pull/908) [`dcc7407`](https://github.com/TanStack/ai/commit/dcc74077dc9f27ca3b88b0c349159728f7868fbe) - fix(ai-gemini, ai-openai): don't buffer arbitrary HTTP(S) URL image inputs by default on paths that require uploaded bytes.

  Gemini **Veo** (`createGeminiVideo`), OpenAI image **edits** (`createOpenaiImage`), and OpenAI **Sora** `input_reference` (`createOpenaiVideo`) have no URL passthrough — the provider only accepts inline bytes (or, for Veo, a `gs://` reference). Previously an HTTP(S) URL image input was silently fetched and buffered in memory, which can OOM memory-constrained runtimes (e.g. Cloudflare Workers).

  These paths now **throw** on an HTTP(S) URL image input by default, with an error pointing to the alternatives. `data:` URIs (and `gs://` for Veo) still work without any flag. To opt back into fetching + buffering, set `allowUrlFetch: true` on the adapter config:

  ```ts
  createOpenaiImage('gpt-image-1', apiKey, { allowUrlFetch: true })
  createOpenaiVideo('sora-2', apiKey, { allowUrlFetch: true })
  createGeminiVideo('veo-3.1-generate-preview', apiKey, {
    allowUrlFetch: true,
  })
  ```

  Migration: if you passed HTTP(S) URL image inputs to these adapters, either fetch the bytes yourself and pass a `data:` URI, pass a `gs://` reference (Veo), or set `allowUrlFetch: true`.

- [#405](https://github.com/TanStack/ai/pull/405) [`2665085`](https://github.com/TanStack/ai/commit/2665085970ab4d792778bb2b635ef27fbdcb6be1) - Added Gemini Realtime Adapter

### Patch Changes

- [#924](https://github.com/TanStack/ai/pull/924) [`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5) - fix: resolve directory-barrel imports in published `.d.ts` files. Bare imports of `utils`/`tools`/`middleware` barrels were emitted as `../utils.js` (etc.), which do not resolve under bundler/node16/nodenext (no `/index` fallback for explicit `.js`). With consumer `skipLibCheck: true` those symbols silently became `any`. Imports now target concrete modules (e.g. `utils/client`, `middleware/types`) or explicit `/index` paths so public types resolve correctly.

- [#919](https://github.com/TanStack/ai/pull/919) [`d453647`](https://github.com/TanStack/ai/commit/d453647500e33a1412f84a2cc91d486a11265b9b) - fix(ai-gemini): fix `GeminiClientConfig` type import in the published adapter declarations. The emitted `.d.ts` files imported `GeminiClientConfig` from a non-existent `'../utils.js'` (the barrel builds to `utils/index.js`), so under `skipLibCheck` it silently resolved to `any` in consumers — masking client-config type-checking for every adapter and producing a spurious "`httpOptions` does not exist" error on `createGeminiVideo`. Adapters now import the type from the concrete `'../utils/client'` module so the declarations resolve to the real type.

- [#908](https://github.com/TanStack/ai/pull/908) [`dcc7407`](https://github.com/TanStack/ai/commit/dcc74077dc9f27ca3b88b0c349159728f7868fbe) - fix(ai-gemini): stop fetching arbitrary HTTPS image URLs in `createGeminiImage`. URL sources in multimodal image-generation prompts now pass through as `fileData.fileUri` (Gemini fetches them server-side), matching the chat adapter. This avoids fetch + base64 double-buffering that could OOM on memory-constrained runtimes such as Cloudflare Workers.

- [#922](https://github.com/TanStack/ai/pull/922) [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669) - fix: resolve dangling relative imports in published declaration files

  Switch directory-barrel imports (`../utils`, `../tools`, `../middleware`) to
  concrete module paths so emitted `.d.ts` specifiers resolve under
  `bundler`/`node16`/`nodenext` resolution. Adds a `test:dts` scanner guardrail.

  Fixes [#920](https://github.com/TanStack/ai/issues/920)

- Updated dependencies [[`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5), [`2665085`](https://github.com/TanStack/ai/commit/2665085970ab4d792778bb2b635ef27fbdcb6be1), [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`de5fbb5`](https://github.com/TanStack/ai/commit/de5fbb52a916826cdc0ef31d18df402cd611b9d4)]:
  - @tanstack/ai@0.41.0

## 0.19.1

### Patch Changes

- Updated dependencies [[`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a)]:
  - @tanstack/ai@0.40.0

## 0.19.0

### Minor Changes

- [#875](https://github.com/TanStack/ai/pull/875) [`f0c12ba`](https://github.com/TanStack/ai/commit/f0c12ba0895704156c1853c09ae41646cce9254b) - Drop retired Gemini media models and add **Veo 3.1 Lite**.

  The following models return `404 NOT_FOUND` from the Gemini Developer API and have been removed from the adapter's model lists and type maps:
  - `imagen-3.0-generate-002` (superseded by the Imagen 4 family)
  - `veo-2.0-generate-001`
  - `veo-3.0-generate-001`
  - `veo-3.0-fast-generate-001`

  Added `veo-3.1-lite-generate-preview` (Veo 3.1 Lite) — the lowest-cost Veo 3.1 tier ($0.05/sec, 720p, video + audio), with the same `4 | 6 | 8` second durations as the rest of the Veo 3.1 family.

  If you were referencing one of the removed model ids, switch to a current model (e.g. `imagen-4.0-generate-001`, `veo-3.1-generate-preview`, or `veo-3.1-lite-generate-preview`).

- [#874](https://github.com/TanStack/ai/pull/874) [`84d1225`](https://github.com/TanStack/ai/commit/84d1225046b70f67a1af5ee428893ffa96e9ab65) - Add proper support for **Nano Banana 2 Lite** (`gemini-3.1-flash-lite-image`) as a Gemini-native image model. The automated model sync had landed this model mis-classified as a text-only chat model (`output: ['text']`, in `GEMINI_MODELS`); it's now corrected and wired into the image surface — routed through the `generateContent` API with `output: ['text', 'image']`, template-literal sizes (`aspectRatio_resolution`, e.g. `"1:1_2K"`), and image-conditioned prompts, matching the other native image models. Built for ultra-low-latency, low-cost image generation and editing.

  Also fixes the OpenRouter model sync (`scripts/sync-provider-models.ts`) so native image models that output both text and image are skipped for manual curation instead of being inserted as chat models.

### Patch Changes

- [#772](https://github.com/TanStack/ai/pull/772) [`00505fe`](https://github.com/TanStack/ai/commit/00505fe6acdbafdd490ba1c903991e067384e0c7) - Update model metadata from OpenRouter API

## 0.18.4

### Patch Changes

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai@0.39.0

## 0.18.3

### Patch Changes

- Updated dependencies [[`c1a8732`](https://github.com/TanStack/ai/commit/c1a87327b4a3463d37158f32ca90184b5fd092bb)]:
  - @tanstack/ai@0.38.0

## 0.18.2

### Patch Changes

- [#844](https://github.com/TanStack/ai/pull/844) [`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff) - Republish all packages with their compiled `dist/` output.

  Releases `0.33.0`–`0.36.0` were published without a `dist/` directory: the
  release workflow relied on an Nx-cached `build` whose outputs were not
  materialized to disk before `changeset publish` packed the tarballs, and
  `files: ["dist"]` silently includes nothing when `dist/` is absent. The
  published packages therefore contained only `src/`, so every export
  (`./dist/esm/*.js`) resolved to a missing file and the packages were
  uninstallable.

  The publish step now runs a fresh, cache-bypassing build of all packages
  immediately before publishing, guaranteeing compiled artifacts are present in
  every tarball.

- Updated dependencies [[`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff)]:
  - @tanstack/ai@0.37.0
  - @tanstack/ai-utils@0.3.1

## 0.18.1

### Patch Changes

- Updated dependencies [[`fbd3762`](https://github.com/TanStack/ai/commit/fbd37623b287e370aa5678e161dec19cf13ae33b)]:
  - @tanstack/ai@0.36.0

## 0.18.0

### Minor Changes

- [#781](https://github.com/TanStack/ai/pull/781) [`6f3b353`](https://github.com/TanStack/ai/commit/6f3b35314a287fd9fd29eecd0478cc8352f64732) - Upgrade `@google/genai` to v2 and migrate the experimental text-interactions adapter to the SDK 2.x step-based streaming API (`step.start` / `step.delta` / `step.stop`), replacing the prior `content.*` events. Streamed function-call arguments are now accumulated from `arguments_delta` fragments and parsed leniently with `partial-json`, so an incomplete or truncated buffer keeps the last good arguments instead of resetting them and no longer logs a parse error per fragment. Exported built-in-tool CUSTOM event payloads now carry `Interactions.*Step` values, and structured output uses the polymorphic `response_format` request shape.

## 0.17.3

### Patch Changes

- Updated dependencies [[`c04abd3`](https://github.com/TanStack/ai/commit/c04abd35284d464d830bb9f15129c7a7c2533d3f)]:
  - @tanstack/ai@0.35.0

## 0.17.2

### Patch Changes

- [#480](https://github.com/TanStack/ai/pull/480) [`eddfbbd`](https://github.com/TanStack/ai/commit/eddfbbdfd979cad7874f0fb33695c5c41331631e) - Bind tool calls to the assistant message in tool-first streams by setting AG-UI's
  `parentMessageId` on `TOOL_CALL_START`.

  When a provider streams a tool call **before** any text, the `StreamProcessor` had no
  active assistant message to attach it to, so it created one under a temporary local id.
  The later `TEXT_MESSAGE_START` then carried the real provider message id, forcing a
  mid-stream id change — which destabilizes `UIMessage.id` and can remount the message
  subtree in `useChat` (React list keys, etc.). See [#477](https://github.com/TanStack/ai/issues/477).

  Every text adapter generates one stable assistant message id per stream and already uses
  it for `TEXT_MESSAGE_START`; they now also emit it as `parentMessageId` on
  `TOOL_CALL_START`. The processor reads `chunk.parentMessageId` (`?? active assistant id`)
  so the message is created with the correct id immediately and the subsequent
  `TEXT_MESSAGE_START` matches — no rename, no remount.

  Fixed across all adapters that emit `TOOL_CALL_START` (Anthropic, OpenAI Responses +
  Chat Completions via `@tanstack/openai-base`, OpenRouter, Gemini including the
  experimental text-interactions adapter, and Ollama).

- Updated dependencies [[`31de22b`](https://github.com/TanStack/ai/commit/31de22b1ae780c53e3abbf9cf17e1db7b62de84a)]:
  - @tanstack/ai-utils@0.3.0
  - @tanstack/ai@0.34.0

## 0.17.1

### Patch Changes

- Updated dependencies [[`2cb0313`](https://github.com/TanStack/ai/commit/2cb0313c1f13e1db37c5550308e36bb0b9b73b98), [`18e5f4d`](https://github.com/TanStack/ai/commit/18e5f4d9746a26c3194929ea4b49673728e8eaa5), [`21720dd`](https://github.com/TanStack/ai/commit/21720dd73524d624594a6dfb7e4669c03cc08af0), [`243b8fa`](https://github.com/TanStack/ai/commit/243b8fad7e8a48b68a1a96962ee1443cbd6a0ced)]:
  - @tanstack/ai@0.33.0

## 0.17.0

### Minor Changes

- [#624](https://github.com/TanStack/ai/pull/624) [`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f) - Add a Google Veo video adapter (`geminiVideo` / `createGeminiVideo`) and the
  per-model typed-duration video contract it is built on ([#534](https://github.com/TanStack/ai/issues/534), [#634](https://github.com/TanStack/ai/issues/634)).

  **`@tanstack/ai`** (additive, non-breaking): `VideoAdapter` /
  `BaseVideoAdapter` gain a `TModelDurationByName` generic (defaulting to
  `Record<string, number>`, preserving today's `duration?: number` typing for
  adapters without a map) plus two introspection methods with safe defaults:
  - `availableDurations()` — a `DurationOptions` tagged union
    (`discrete | range | mixed | none`) describing the durations the current
    model accepts. Default: `{ kind: 'none' }`.
  - `snapDuration(seconds)` — coerce raw seconds to the closest valid duration
    (`snapToDurationOption` is exported for adapter authors). Default:
    `undefined`.

  `generateVideo({ duration })` is now typed per model via
  `VideoDurationForAdapter<TAdapter>`.

  **`@tanstack/ai-gemini`**: new Veo adapter over the long-running
  `:predictLongRunning` operation, supporting `veo-3.1-generate-preview`,
  `veo-3.1-fast-generate-preview`, `veo-3.0-generate-001`,
  `veo-3.0-fast-generate-001`, and `veo-2.0-generate-001`:
  - `geminiVideo('veo-3.0-generate-001')` → `duration?: 4 | 6 | 8`
    (Veo 2: `5 | 6 | 8`); `adapter.snapDuration(7)` → `6`.
  - Multimodal prompts: the first un-roled / `'start_frame'` image part
    becomes the input image, `'end_frame'` → `lastFrame`, `'reference'` /
    `'character'` → `referenceImages`.
  - `size` takes Veo aspect ratios (`'16:9' | '9:16'`); everything else from
    the SDK's `GenerateVideosConfig` (e.g. `resolution`, `generateAudio`,
    `negativePrompt`) is available through `modelOptions`.
  - Responsible-AI filtering is surfaced as a failed job with the filter
    reasons.

  Note: Veo result URLs are served by the Gemini Files API and require the
  Google API key to download (`x-goog-api-key` header or `key` query
  parameter).

- [#624](https://github.com/TanStack/ai/pull/624) [`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f) - `generateImage()` and `generateVideo()` now accept a multimodal `prompt`: a plain string, or an ordered array of content parts (`TextPart` / `ImagePart` / `VideoPart` / `AudioPart`) for image-conditioned generation, image-to-image, multi-reference, image-to-video, and edit / inpaint flows. Part order is meaningful — "not like this _(image)_, more like this _(image)_" — and each media part may carry a `metadata.role` hint (`'reference' | 'mask' | 'control' | 'start_frame' | 'end_frame' | 'character'`) that adapters use to route to the provider-specific field, plus an informational `metadata.tag` label for your own bookkeeping. The accepted part types are narrowed per model at compile time via each adapter's input-modality map, so passing an image part to a text-only model is a type error (with a clear runtime throw as backstop).

  Prompt text is always sent **verbatim** — the SDK never injects or rewrites in-prompt referencing markers. To reference inputs from your prompt, write the provider's own convention (fal Kling / Seedance `@Image1`, OpenAI / FLUX.2 `"image 1"` prose, Gemini content descriptions); see the image-generation docs for the per-provider table.

  Provider behavior in this release:
  - **OpenAI image** — Prompts with image parts route `gpt-image-2` / `gpt-image-1` / `gpt-image-1-mini` to `images.edit()` (up to 16 source images plus optional mask); `dall-e-2` routes to `images.edit()` with one source image; `dall-e-3` rejects image parts at compile time and at runtime.
  - **OpenAI video** — Sora-2 / Sora-2-Pro accept a single image part as `input_reference`; passing more than one throws.
  - **Gemini image** — Native models (`gemini-*-flash-image`, "nano-banana") map prompt parts 1:1 onto multimodal `contents`, preserving interleaved order. Imagen is text-only (compile-time + runtime rejection).
  - **fal.ai** — Field names resolve per endpoint from a map generated from the fal SDK's endpoint types (362 endpoints with nonstandard fields, e.g. nano-banana edit → `image_urls`, Kling i2v start frame → `image_url`, Veo first-last-frame → `first_frame_url` / `last_frame_url`). Defaults for endpoints not in the map: single → `image_url`, multiple → `image_urls`; `role: 'mask'` → `mask_url`; `role: 'control'` → `control_image_url`; `role: 'reference'` / `'character'` → `reference_image_urls`; video `role: 'start_frame'` / `'end_frame'` → `start_image_url` / `end_image_url`. Per-model prompt modalities are derived at the type level from the SDK's endpoint input types. Regenerate the map after a fal SDK bump with `pnpm generate:fal-image-fields` (a unit test fails when it goes stale). In `FalImageProviderOptions` / `FalVideoProviderOptions`, media-conditioning fields the mappers can populate (`image_url`, `start_image_url`, `video_url`, `audio_url`, …) are demoted from required to optional — supply them as prompt parts, or keep passing them explicitly via `modelOptions`.
  - **Grok** — New `grok-imagine-image` / `grok-imagine-image-quality` models. Prompts with image parts route to xAI's JSON `/v1/images/edits` endpoint (up to 3 source images, addressed by xAI in request order; the prompt is sent verbatim). `role: 'mask'` / `'control'` throw. Their `size` uses an `aspectRatio_resolution` template (`'16:9_2k'`, suffix optional) mirroring Gemini's native image models. `grok-2-image-1212` remains text-to-image only.
  - **OpenRouter** — Prompt parts map 1:1 onto multimodal `text` / `image_url` chat content parts, preserving interleaved order, and are forwarded to the underlying image model. URL sources pass through verbatim (no fetching or re-encoding in your process); `data` sources become data URIs.
  - **Anthropic** — Unchanged (no image generation API).

  A new `resolveMediaPrompt()` utility (exported from `@tanstack/ai`) is the single downrev point from the canonical interleaved prompt shape to flattened text + per-modality part buckets, for adapter authors.

  On the client side, `ImageGenerateInput.prompt` and `VideoGenerateInput.prompt` (`@tanstack/ai-client`, and the `useGenerateImage` / `useGenerateVideo` hooks built on them) are widened from `string` to the same `MediaPrompt` shape, so prompt parts can be sent from the browser through your server route to `generateImage()` / `generateVideo()`.

  Closes [#618](https://github.com/TanStack/ai/issues/618).

### Patch Changes

- Updated dependencies [[`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f), [`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f)]:
  - @tanstack/ai@0.32.0

## 0.16.2

### Patch Changes

- Updated dependencies [[`07aaf8b`](https://github.com/TanStack/ai/commit/07aaf8b9e5a8e699be25f936cc9cd651a46c16c5)]:
  - @tanstack/ai@0.31.0

## 0.16.1

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`7103348`](https://github.com/TanStack/ai/commit/71033488212bff05dcccc857e721ab9262ebc2a6), [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai@0.30.0
  - @tanstack/ai-utils@0.2.2

## 0.16.0

### Minor Changes

- [#714](https://github.com/TanStack/ai/pull/714) [`efa76c8`](https://github.com/TanStack/ai/commit/efa76c8cdac37f402a0b35d74538ed2ae477e45c) - Sync Gemini model metadata with Google's current published model list ([#620](https://github.com/TanStack/ai/issues/620), [#621](https://github.com/TanStack/ai/issues/621)).

  **Added**
  - `gemini-3.1-flash-lite` (stable GA) — joins the existing `gemini-3.1-flash-lite-preview` entry and qualifies for the native combined tools + `responseSchema` streaming path (`GEMINI_COMBINED_TOOLS_AND_SCHEMA_MODELS`).

  **Removed (retired by Google — these ids now 404 against the Gemini API or are no longer published)**
  - `gemini-3-pro-preview` (verified 404; superseded by `gemini-3.1-pro-preview`)
  - `gemini-2.5-flash-preview-09-2025` (superseded by stable `gemini-2.5-flash`)
  - `gemini-2.5-flash-lite-preview-09-2025` (superseded by stable `gemini-2.5-flash-lite`)
  - `gemini-2.0-flash` and `gemini-2.0-flash-lite` (2.0 line retired from Google's published list)
  - `gemini-2.0-flash-preview-image-generation` (image; superseded by `gemini-2.5-flash-image`)

  **Fixed**
  - `gemini-3.5-flash` was missing from `GeminiChatModelToolCapabilitiesByName`, leaving its provider-tool typing broken.

  If you were passing a removed id to `geminiText()` / `geminiSummarize()`, switch to the listed successor (e.g. `gemini-2.0-flash` → `gemini-2.5-flash`).

### Patch Changes

- Updated dependencies [[`ff267a5`](https://github.com/TanStack/ai/commit/ff267a5536327b006979f9f28ce2df7cc27f6e23), [`570c08a`](https://github.com/TanStack/ai/commit/570c08a8d1a35746c3d31a63188249cba2d2475a), [`22c9b42`](https://github.com/TanStack/ai/commit/22c9b42baec74914b720e440f29bd02be04eb164), [`215b6b4`](https://github.com/TanStack/ai/commit/215b6b401aa95d1d38da342aa09603cb1d616929), [`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0)]:
  - @tanstack/ai@0.29.0

## 0.15.1

### Patch Changes

- Updated dependencies [[`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6), [`c0af426`](https://github.com/TanStack/ai/commit/c0af4262d269be67c69d6f878d9618f25fdeee19), [`00e0c93`](https://github.com/TanStack/ai/commit/00e0c932e6cb5e31f75f4b5e94486d7eb02b9ce1), [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6)]:
  - @tanstack/ai@0.28.0

## 0.15.0

### Minor Changes

- [#660](https://github.com/TanStack/ai/pull/660) [`6df32b5`](https://github.com/TanStack/ai/commit/6df32b53026673d159e6df0892ce89effcb5c7b8) - **BREAKING:** Sampling options (`temperature`, `topP`, `maxTokens`) have moved off the root of `chat()` / `ai()` / `generate()` and into provider-native `modelOptions`. There is no longer a generic root-level sampling surface — each provider accepts its own native keys, fully typed per model:
  - OpenAI (Responses): `modelOptions: { temperature, top_p, max_output_tokens }`
  - Anthropic: `modelOptions: { temperature, top_p, max_tokens }`
  - Gemini: `modelOptions: { temperature, topP, maxOutputTokens }`
  - Grok: `modelOptions: { temperature, top_p, max_tokens }`
  - Groq: `modelOptions: { temperature, top_p, max_completion_tokens }`
  - Ollama: `modelOptions: { options: { temperature, top_p, num_predict } }` (nested)
  - OpenRouter (chat): `modelOptions: { temperature, topP, maxCompletionTokens }`

  Middleware no longer sees `temperature`/`topP`/`maxTokens` as first-class fields on `ChatMiddlewareConfig`; mutate `config.modelOptions` (with the provider-native keys above) instead. `metadata` is unaffected and stays at the root.

  The public `OllamaTextProviderOptions` type export has also been removed from `@tanstack/ai-ollama`. `modelOptions` is now typed per model — use the exported `OllamaChatModelOptionsByName` map (indexed by model name) or the underlying `ChatRequest` from the `ollama` SDK for arbitrary model strings.

  Migrate automatically with the codemod, which resolves the provider from the adapter and rewrites the keys for you:

  ```bash
  pnpm codemod:move-sampling-to-model-options "src/**/*.{ts,tsx}"
  ```

  See the [Sampling Options migration guide](https://tanstack.com/ai/latest/docs/migration/sampling-options-to-model-options) for details.

### Patch Changes

- Updated dependencies [[`6df32b5`](https://github.com/TanStack/ai/commit/6df32b53026673d159e6df0892ce89effcb5c7b8)]:
  - @tanstack/ai@0.27.0

## 0.14.1

### Patch Changes

- Updated dependencies [[`5d6cd28`](https://github.com/TanStack/ai/commit/5d6cd2834ba7ac1d7c7c1bd24ede202bf3e78010)]:
  - @tanstack/ai@0.26.0

## 0.14.0

### Minor Changes

- [#242](https://github.com/TanStack/ai/pull/242) [`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f) - Enhanced token usage reporting for every provider.

  `TokenUsage` is now the single canonical run-usage type. It is defined once in
  `@tanstack/ai-event-client` (the dependency-free leaf package) and re-exported by
  `@tanstack/ai`, so the two packages can no longer drift. It carries optional
  detailed breakdowns alongside the core token counts: `promptTokensDetails` /
  `completionTokensDetails` (cached, reasoning, audio, and per-modality tokens),
  `durationSeconds` for duration-billed models (e.g. Whisper transcription),
  `providerUsageDetails` for provider-specific metrics, and `cost` / `costDetails`
  for provider-reported cost — so a single `usage` shape covers counts, detailed
  breakdowns, and cost.

  `TokenUsage` is generic over its provider details bag —
  `TokenUsage<TProviderDetails = ProviderUsageDetails>` — so adapters return a
  strongly-typed `providerUsageDetails` (e.g. `TokenUsage<AnthropicProviderUsageDetails>`)
  while generic consumers keep the open-record default. The default,
  `ProviderUsageDetails` (`Record<string, NonNullable<unknown>>`), is now exported and
  uses non-nullish values rather than `unknown` so `TokenUsage` stays assignable across
  JSON-serialization boundaries (e.g. TanStack Start server-fn return types). Each
  provider's usage
  extractor now returns `undefined` (rather than fabricating zeroed totals) when
  the provider reports no usage object, so an absent `usage` is distinguishable
  from a genuine zero-token run.

  `@tanstack/ai` still exports `UsageTotals` as a `@deprecated` alias of
  `TokenUsage` for backward compatibility; it will be removed in a future release.

  Detailed usage is extracted in one place per SDK surface: OpenAI-compatible
  providers (OpenAI, Grok, Groq) share the extractors in `@tanstack/openai-base`,
  while Anthropic, Gemini, Ollama, and OpenRouter normalize their own provider
  usage. The devtools surface cached and reasoning token badges per iteration.

  Usage is now unified across **every modality**, not just text/chat. Image, audio,
  and text-to-speech results report the same canonical `TokenUsage` (with
  per-modality breakdowns) instead of a minimal `inputTokens`/`outputTokens` shape:
  - `ImageGenerationResult.usage`, `AudioGenerationResult.usage`, and the new
    `TTSResult.usage` are now typed as `TokenUsage`. **Breaking:** consumers of
    these fields should read `promptTokens`/`completionTokens` instead of
    `inputTokens`/`outputTokens`. `@tanstack/ai-event-client`'s `ImageUsage` is now
    a `@deprecated` alias of `TokenUsage`.
  - OpenAI/Grok image generation surface the text-vs-image input token breakdown
    (`promptTokensDetails`), Gemini image/audio/TTS now surface their full
    `usageMetadata` (previously dropped), and OpenRouter image generation surfaces
    the chat usage it already returns.
  - Bug fixes: Ollama no longer produces `NaN` totals or discards duration-only
    usage; Anthropic defaults missing `output_tokens` and no longer emits empty
    `promptTokensDetails`/`providerUsageDetails` objects; OpenAI GPT-4o
    transcription reads the real audio/text input token breakdown and never falls
    back to duration billing.

  Cross-adapter usage parity fixes:
  - `PromptTokensDetails`/`CompletionTokensDetails` gain a `documentTokens` field,
    and Gemini now surfaces `DOCUMENT` modality token counts (e.g. PDF inputs)
    instead of silently dropping them.
  - OpenAI-compatible chat (OpenAI/Grok/Groq via `@tanstack/openai-base`) now
    surfaces Predicted-Outputs `acceptedPredictionTokens`/`rejectedPredictionTokens`
    under `providerUsageDetails`, matching the OpenRouter adapter (rejected
    prediction tokens are billed).
  - Grok transcription (`/v1/stt`) now reports `durationSeconds`, mirroring the
    Whisper-1 path in the OpenAI transcription adapter.

### Patch Changes

- Updated dependencies [[`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f)]:
  - @tanstack/ai@0.25.0

## 0.13.0

### Minor Changes

- [#666](https://github.com/TanStack/ai/pull/666) [`c1ae8b9`](https://github.com/TanStack/ai/commit/c1ae8b94c83d70508975568eb4fc9b45f1af540b) - feat: support multimodal (image) tool results

  Tools may now return an `Array<ContentPart>` (e.g. a text part plus an image part) and have it transmitted to the model as structured multimodal tool output instead of a `JSON.stringify`'d blob. This unblocks use cases like returning a screenshot from a tool so the model can see it (issue [#363](https://github.com/TanStack/ai/issues/363)).
  - Detection is structural and opt-in by shape: a tool that returns a non-empty array whose every element is a valid `ContentPart` is passed through unchanged; strings and all other return values are serialized exactly as before, so there are no breaking changes.
  - The OpenAI Responses, Anthropic, and Google Gemini adapters convert the content parts into their native multimodal tool-output formats (`function_call_output.output`, `tool_result` content blocks, and `functionResponse.parts` respectively). Providers on the Chat Completions path (Groq, Ollama, Grok, OpenRouter chat) fall back to stringifying, which their APIs require.
  - AG-UI stream events (`TOOL_CALL_RESULT.content`, `TOOL_CALL_END.result`) remain string-only per the spec; the multimodal array travels on the tool message itself.

- [#673](https://github.com/TanStack/ai/pull/673) [`a452ae8`](https://github.com/TanStack/ai/commit/a452ae8bcda8abfdc6309983976ed0fbf6df1915) - Populate AG-UI `rawEvent` on `RUN_ERROR` events with the provider's structured error body.

  Previously, when a streaming chat call failed the `RUN_ERROR` event carried only an
  opaque `{ message, code }` headline (e.g. `"Provider returned error"`), and no adapter
  populated AG-UI's purpose-built `rawEvent` field — so the upstream provider detail was
  unrecoverable.

  Adapters now forward the provider's **structured error body** (e.g. an SDK `APIError`'s
  parsed `.error` response body, or OpenRouter's mid-stream `chunk.error`) as `rawEvent`
  on the `RUN_ERROR` event. The new `toRunErrorRawEvent` helper extracts only known
  provider-body fields — never the raw SDK exception object, which can carry request
  metadata such as auth headers. The `{ message, code }` contract of `toRunErrorPayload`
  is unchanged.

  The error surfaced to consumers via the `ChatClient` / `useChat` `error` (and the
  `onError` callback) now also carries `code` and `rawEvent` when present, so the upstream
  cause is recoverable in application code.

  > Note: the OpenRouter SDK parses each in-band stream chunk's `error` through a strict
  > schema (`{ code, message }`), so provider `metadata` survives only on pre-stream HTTP
  > errors (rate-limit / overload / BYOK rejection), whose typed error class exposes the
  > full body via `.error`.

### Patch Changes

- Updated dependencies [[`c1ae8b9`](https://github.com/TanStack/ai/commit/c1ae8b94c83d70508975568eb4fc9b45f1af540b), [`a452ae8`](https://github.com/TanStack/ai/commit/a452ae8bcda8abfdc6309983976ed0fbf6df1915), [`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai@0.24.0

## 0.12.1

### Patch Changes

- [#655](https://github.com/TanStack/ai/pull/655) [`e6ff2b4`](https://github.com/TanStack/ai/commit/e6ff2b4b24f5363830d960f77a4139ad6bd00d08) - Surface token usage from the Gemini image adapter's `generateContent` path
  (e.g. Nano Banana) by parsing `usageMetadata` from the response instead of
  omitting `usage`. The Imagen (`generateImages`) path is unchanged — that SDK
  response type does not expose `usageMetadata`. Fixes [#330](https://github.com/TanStack/ai/issues/330).
- Updated dependencies [[`980ff9b`](https://github.com/TanStack/ai/commit/980ff9ba925f5dbae62a9318cc1e787d0ae24314), [`d5645cf`](https://github.com/TanStack/ai/commit/d5645cfd4d1b9cfc877f7d4d714517e166a99ce3)]:
  - @tanstack/ai@0.23.0

## 0.12.0

### Minor Changes

- feat(ai-gemini): add experimental `geminiTextInteractions()` adapter for Gemini's stateful Interactions API (Beta) ([#502](https://github.com/TanStack/ai/pull/502))

  Routes through `client.interactions.create` instead of `client.models.generateContent`, so callers can pass `previous_interaction_id` via `modelOptions` and let the server retain conversation history. On each run, the returned interaction id is surfaced via an AG-UI `CUSTOM` event (`name: 'gemini.interactionId'`) emitted just before `RUN_FINISHED` — feed it back on the next turn via `modelOptions.previous_interaction_id`.

  Exported from a dedicated `@tanstack/ai-gemini/experimental` subpath so the experimental status is load-bearing in your editor and bundle:

  ```ts
  import { geminiTextInteractions } from '@tanstack/ai-gemini/experimental'
  ```

  Scope: text/chat output with function tools, plus the built-in tools `google_search`, `code_execution`, `url_context`, `file_search`, and `computer_use`. Built-in tool activity is surfaced as AG-UI `CUSTOM` events named `gemini.googleSearchCall` / `gemini.googleSearchResult` (and the matching `codeExecutionCall`/`Result`, `urlContextCall`/`Result`, `fileSearchCall`/`Result` variants), carrying the raw Interactions delta payload. Function-tool `TOOL_CALL_*` events are unchanged, and `finishReason` stays `stop` when only built-in tools ran — the core chat loop has nothing to execute.

  `google_search_retrieval`, `google_maps`, and `mcp_server` are not supported on this adapter and throw a targeted error explaining the alternative. Image/audio output via Interactions is also not routed through this adapter — use `geminiText()`, `geminiImage`, or `geminiSpeech` for those.

  Marked `@experimental` — the underlying Interactions API is Beta and Google explicitly flags possible breaking changes.

## 0.11.0

### Minor Changes

- Route `chat({ outputSchema, tools })` through the provider's native single-pass call where supported (modern OpenAI Chat Completions + Responses, Claude 4.5+, Gemini 3.x, Grok 4.x family). Closes #605. ([#609](https://github.com/TanStack/ai/pull/609))

  Historically, `chat({ outputSchema, tools })` ran the agent loop with `tools` and then issued a separate finalization call against the structured-output adapter for the typed answer — because most providers couldn't combine `tools` with a schema-constrained response in one call. That has changed for most modern providers, making the second round-trip pure overhead.

  **New per-adapter capability:** `TextAdapter.supportsCombinedToolsAndSchema?(modelOptions?)`. Adapters that opt in receive a JSON Schema on `TextOptions.outputSchema` in `chatStream` and wire it into the upstream request alongside `tools`. The engine harvests the final-turn JSON from the agent loop's accumulated text — no separate finalization call, no `'structuredOutput'` middleware phase.

  **Per-adapter status:**
  - **OpenAI (Chat Completions + Responses):** opted in for all models. `response_format: json_schema` / `text.format: json_schema` attached when `outputSchema` is set.
  - **Anthropic:** opted in for Claude 4.5+ (Opus / Sonnet / Haiku 4.5, 4.6, 4.7). Wires `output_config.format` on the beta Messages request. Pre-4.5 Claude models keep the forced-tool finalization workaround. Gated by exported `ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
  - **Gemini:** opted in for Gemini 3.x (3-pro, 3-flash, 3.1-pro-preview, 3.1-flash-lite). Wires `responseSchema` + `responseMimeType: 'application/json'` into the regular `generateContentStream` call. Gemini 2.x keeps the legacy path. Gated by exported `GEMINI_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
  - **Grok (xAI):** opted in for the Grok 4 family (`grok-4`, `grok-4-1-fast-*`, `grok-4-fast-*`, `grok-4-20*`, `grok-4-3`, `grok-code-fast-1`). Inherits the OpenAI Chat Completions wiring from `openai-base`; the override gates the capability claim by model. Grok 2 / 3 keep the legacy path. Gated by exported `GROK_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
  - **Groq:** explicitly opts out — the Groq API rejects `response_format` + `tools` + `stream` with HTTP 400 ("Streaming and tool use are not currently supported with Structured Outputs").
  - **OpenRouter, Ollama:** unchanged; still take the legacy finalization path. OpenRouter's per-request capability lookup (depends on resolved upstream model) is tracked as a follow-up.

  **Backward compatibility:**
  - `'structuredOutput'` middleware phase still fires for fallback-path adapters. It does NOT fire for adapters that handle the combination natively — middleware sees the run through `'beforeModel'` / `'modelStream'` as usual.
  - `onStructuredOutputConfig` keeps its existing surface but only fires on the fallback path.
  - No call-site changes required.

### Patch Changes

- Updated dependencies [[`02f7d04`](https://github.com/TanStack/ai/commit/02f7d0427a406bd2dda6f5a51d1ef1d2600d5ac9)]:
  - @tanstack/ai@0.22.0

## 0.10.10

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai@0.21.2
  - @tanstack/ai-utils@0.2.1

## 0.10.9

### Patch Changes

- Adopt `@tanstack/eslint-config@0.4.0` and clean up the local override layer. ([#607](https://github.com/TanStack/ai/pull/607))
  - Bump `@tanstack/eslint-config` from `0.3.3` to `0.4.0`.
  - Drop dead `pnpm/enforce-catalog` and `pnpm/json-enforce-catalog` disables (upstream removed `eslint-plugin-pnpm` in `0.3.1`).
  - Drop the `no-case-declarations: off` override — no current source actually violates it.
  - Drop the `no-shadow: off` override — upstream sets it to `warn`, so it surfaces in editors without blocking CI.
  - Remove ~25 unnecessary type assertions across the publishable packages that the upgraded `typescript-eslint` now catches via `no-unnecessary-type-assertion`. One deliberately defensive cast in `ag-ui-wire.ts` is preserved with an inline opt-out and a reason comment.

  No public-API or runtime-behavior changes.

- Update model metadata from OpenRouter API ([#594](https://github.com/TanStack/ai/pull/594))

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529), [`188fe11`](https://github.com/TanStack/ai/commit/188fe11b9b9691e5a241cfc416803da5b8ce5376)]:
  - @tanstack/ai@0.21.0

## 0.10.8

### Patch Changes

- Tighten TypeScript safety: enable `noImplicitOverride`, ([#579](https://github.com/TanStack/ai/pull/579))
  `noFallthroughCasesInSwitch`, and `useDefineForClassFields` in the
  root `tsconfig.json`; add a typed-ESLint block scoped to
  `packages/*/src/**` that turns on `no-floating-promises`,
  `no-misused-promises`, `await-thenable`,
  `switch-exhaustiveness-check`, `consistent-type-exports`,
  `prefer-readonly`, and `no-non-null-assertion` (errors), plus
  `no-explicit-any` (warning). `@ts-ignore` and `@ts-nocheck` are
  disallowed in library source via `@typescript-eslint/ban-ts-comment`,
  and `as unknown as <T>` double-casts are blocked by a
  `no-restricted-syntax` rule (escape hatches available with an inline
  reason). Two flags from the original five-flag set —
  `noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes`
  — were tried and rolled back: they produced ~500 lines of bracket-
  access and conditional-spread churn without catching any real bugs,
  and `exactOptionalPropertyTypes` would have forced consumers using
  it themselves to deal with our internals' style preferences.

  User-visible API surface is unchanged; this is a hardening pass to
  keep streaming/agent-loop correctness and discriminated-union
  exhaustiveness honest going forward. See issue #564.

- Updated dependencies [[`2ad137b`](https://github.com/TanStack/ai/commit/2ad137bd22512248bd1684cccce35ba89597cf96)]:
  - @tanstack/ai@0.20.1

## 0.10.7

### Patch Changes

- feat(ai): `systemPrompts` accept `{ content, metadata }` with adapter-inferred metadata typing ([#575](https://github.com/TanStack/ai/pull/575))

  `chat({ systemPrompts })` now accepts either a plain string (the existing
  shape — fully backward compatible) or `{ content, metadata }`. The `metadata`
  field's type is inferred from the adapter via a new
  `TSystemPromptMetadata` generic on `TextAdapter` / `BaseTextAdapter`:
  - `@tanstack/ai-anthropic` declares `AnthropicSystemPromptMetadata` →
    users get `cache_control` autocomplete and type-checking on
    `systemPrompts[i].metadata` for Anthropic chats.
  - Adapters with no per-prompt metadata (OpenAI, Gemini, Ollama,
    OpenRouter, openai-base) inherit the default `never`, which means the
    `metadata` field carries no meaningful value at the call site —
    TypeScript only accepts `undefined` there. Provider-foreign metadata
    that reaches an adapter via JS / `as any` is silently dropped, never
    written to the wire.

  ```ts
  import { chat } from '@tanstack/ai'
  import { anthropicText } from '@tanstack/ai-anthropic'

  // Anthropic — `cache_control` is autocompleted, no `satisfies` needed.
  chat({
    adapter: anthropicText({ apiKey }, 'claude-sonnet-4-6'),
    systemPrompts: [
      {
        content: 'Stable instructions — cache me.',
        metadata: { cache_control: { type: 'ephemeral' } },
      },
      'Volatile per-request instruction.',
    ],
  })

  // OpenAI — `metadata` is `never`; only `undefined` is assignable, so the
  // field is effectively unusable. The object form without `metadata` still
  // works for portability.
  chat({
    adapter: openaiText({ apiKey }, 'gpt-4o-mini'),
    systemPrompts: [
      'Plain string.',
      { content: 'Object form without metadata is allowed.' },
    ],
  })
  ```

  New exports:
  - `@tanstack/ai`: `SystemPrompt`, `NormalizedSystemPrompt` types and the
    `normalizeSystemPrompts()` helper adapters use to normalize the wide
    input shape to `{ content, metadata? }` before consumption.
  - `@tanstack/ai-anthropic`: `AnthropicSystemPromptMetadata` interface
    (currently exposes `cache_control` for prompt caching).

  Internal:
  - New `TSystemPromptMetadata = never` generic on `TextAdapter` /
    `BaseTextAdapter`, surfaced via `'~types'['systemPromptMetadata']`
    for inference at the `chat()` call site.
  - Anthropic adapter reads `metadata.cache_control` and attaches it to
    the corresponding `TextBlockParam`.
  - All other text adapters call `normalizeSystemPrompts()` and join
    `.content` for their respective `instructions` / `system` /
    `systemInstruction` fields. Foreign metadata that reaches them via JS
    / `as any` is dropped (never written to the wire).
  - `normalizeSystemPrompts()` is the public API boundary and throws
    `TypeError` (naming the offending index) for object-form entries whose
    `content` isn't a string — preventing literal `"undefined"` from
    reaching the model on stale call sites.
  - OpenTelemetry middleware attaches per-prompt metadata as the
    `tanstack.ai.system_prompt.metadata` JSON span attribute when
    `captureContent: true` and at least one entry carries metadata, so
    observability backends can distinguish cache hit/miss for Anthropic.
  - `@tanstack/ai-event-client` mirrors the `SystemPrompt` shape locally
    (avoids a circular import) and projects metadata away on the devtools
    wire — devtools UI still receives `Array<string>`.

- Updated dependencies [[`496db9c`](https://github.com/TanStack/ai/commit/496db9c42a7d3051a1295091eae29ae1c31ef997)]:
  - @tanstack/ai@0.20.0

## 0.10.6

### Patch Changes

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49)]:
  - @tanstack/ai@0.19.0

## 0.10.5

### Patch Changes

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099), [`e810153`](https://github.com/TanStack/ai/commit/e810153b34e593d3f3e1bbd8050164a6ad4423ed)]:
  - @tanstack/ai@0.18.0

## 0.10.4

### Patch Changes

- Streaming structured output across the OpenAI-compatible providers, an OpenAI Chat Completions sibling adapter, a summarize-subsystem unification, and the decoupling of `@tanstack/ai-openrouter` from the shared OpenAI base. ([#527](https://github.com/TanStack/ai/pull/527))

  ## Core — `@tanstack/ai`
  - New `chat({ outputSchema, stream: true })` overload returning `StructuredOutputStream<InferSchemaType<TSchema>>`. The stream yields raw JSON deltas via `TEXT_MESSAGE_CONTENT` plus a terminal `CUSTOM` `structured-output.complete` event whose `value.object` is typed against the caller's schema with no helper or cast required.
  - `StructuredOutputStream<T>` is a discriminated union over three tagged `CUSTOM` variants — `structured-output.complete<T>`, `approval-requested`, and `tool-input-available` (new `ApprovalRequestedEvent` / `ToolInputAvailableEvent` interfaces exported from `@tanstack/ai`). Narrowing on `chunk.type === 'CUSTOM' && chunk.name === '<literal>'` resolves `chunk.value` to the exact shape per variant. The bare `CustomEvent` (with `value: any`) is deliberately excluded to keep the narrow from collapsing to `any`; user-emitted events via the `emitCustomEvent` context API still flow at runtime and are documented as a small residual gap.
  - Activity-layer hardening: always-finalise after the stream loop (no silent hangs on missing `finishReason`), typed `RUN_ERROR` on empty content, mid-stream provider errors terminate cleanly, schema-validation failures carry `runId / model / timestamp`.
  - `fallbackStructuredOutputStream` in the activity layer is the single source of truth for adapters that don't implement `structuredOutputStream` natively; `BaseTextAdapter` no longer ships a default.
  - `ChatStreamSummarizeAdapter.summarizeStream` accumulates summary text and emits a terminal `CUSTOM` `generation:result` event before the final `RUN_FINISHED`. Fixes `useSummarize` never populating `result` over streaming connections (the client only sets `result` on that specific CUSTOM event).
  - `SummarizationOptions` is now generic in `TProviderOptions` and `modelOptions` is plumbed through end-to-end (previously silently dropped by `runSummarize` / `runStreamingSummarize`).

  ## Framework hooks — `@tanstack/ai-react`, `@tanstack/ai-vue`, `@tanstack/ai-solid`, `@tanstack/ai-svelte`

  `useChat` (React/Vue/Solid) and `createChat` (Svelte) now accept an `outputSchema` option mirroring `chat({ outputSchema })` on the server. When supplied, the hook's return adds two managed reactive fields:
  - `partial` — the live progressive object, typed `DeepPartial<InferSchemaType<typeof outputSchema>>`. Updated from `TEXT_MESSAGE_CONTENT` deltas via `parsePartialJSON`. Resets on every new run.
  - `final` — the validated terminal payload from the `structured-output.complete` event, typed `InferSchemaType<typeof outputSchema> | null`. `null` until the run completes.

  Both fields are typed against the schema with no helper or cast — each hook is generic on `TSchema` and conditionally adds the fields to the return type. Without `outputSchema`, the return type is unchanged. Works the same for streaming and non-streaming endpoints — for non-streaming, `partial` stays `{}` and `final` snaps when the single terminal event arrives. Reasoning text and tool calls aren't surfaced as separate hook fields — they're already on `messages[…].parts` (as `ThinkingPart`, `ToolCallPart`, `ToolResultPart`), same as a normal chat. When `outputSchema` is set, the assistant's `TextPart` contains the raw JSON the model produced; filter `text` parts out of your message renderer and let the structured view (driven by `partial` / `final`) replace it.

  Reactivity primitive per framework:

  | Framework                      | `partial` type                                          | `final` type                                     |
  | ------------------------------ | ------------------------------------------------------- | ------------------------------------------------ |
  | React (`@tanstack/ai-react`)   | `DeepPartial<T>` (plain state)                          | `T \| null` (plain state)                        |
  | Vue (`@tanstack/ai-vue`)       | `Readonly<ShallowRef<DeepPartial<T>>>`                  | `Readonly<ShallowRef<T \| null>>`                |
  | Solid (`@tanstack/ai-solid`)   | `Accessor<DeepPartial<T>>`                              | `Accessor<T \| null>`                            |
  | Svelte (`@tanstack/ai-svelte`) | `readonly partial: DeepPartial<T>` (rune-backed getter) | `readonly final: T \| null` (rune-backed getter) |

  `DeepPartial<T>` is exported from each framework package for callers who want to annotate handlers explicitly.

  ## Base — `@tanstack/openai-base`
  - Package renamed from `@tanstack/ai-openai-compatible` (which remains published for pinned lockfiles but receives no further updates). Imports change:

    ```diff
    - import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/ai-openai-compatible'
    + import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
    - import { OpenAICompatibleResponsesTextAdapter } from '@tanstack/ai-openai-compatible'
    + import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
    ```

  - Centralised `structuredOutputStream` on both bases. Chat Completions uses `response_format: { type: 'json_schema', strict: true }` + `stream: true`; Responses uses `text.format: { type: 'json_schema', strict: true }` + `stream: true`. Subclasses (`ai-openai`, `ai-grok`, `ai-groq`) inherit it; OpenRouter implements its own (see below).
  - Base now adopts the `openai` SDK directly and imports types from `openai/resources/...`. The previously-vendored ~720 LOC of wire-format types (`ChatCompletion`, `ResponseStreamEvent`, etc.) is removed; consumers that imported wire types from the package should import them from the openai SDK instead. The abstract `callChatCompletion*` / `callResponse*` hooks are gone — the base constructor now takes a pre-built `OpenAI` client (`new OpenAIBaseChatCompletionsTextAdapter(model, name, openaiClient)`) and calls `client.chat.completions.create` / `client.responses.create` itself.
  - New protected `isAbortError(error)` hook duck-types abort detection so `RUN_ERROR { code: 'aborted' }` is emitted consistently across SDK error types — subclasses with proprietary error classes (e.g. `@openrouter/sdk`'s `RequestAbortedError`) override.
  - Per-chunk `logger.provider(...)` debug logging now fires inside `structuredOutputStream` loops, matching the existing pattern in `chatStream` for end-to-end introspection in debug mode.

  The other extension hooks (`extractReasoning`, `extractTextFromResponse`, `processStreamChunks`, `makeStructuredOutputCompatible`, `transformStructuredOutput`, `mapOptionsToRequest`, `convertMessage`) remain. Groq's `processStreamChunks` and `makeStructuredOutputCompatible` overrides (for `x_groq.usage` promotion and Groq's structured-output schema quirks) are unchanged.

  ## Provider adapters

  | Adapter                                                    | API              | Reasoning surface                                                                                                |
  | ---------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
  | `@tanstack/ai-openai` `openaiText`                         | Responses        | `response.reasoning_text.delta` + `response.reasoning_summary_text.delta` (requires `reasoning.summary: 'auto'`) |
  | `@tanstack/ai-openai` `openaiChatCompletions` (new)        | Chat Completions | reasoning emitted silently — Chat Completions has no `reasoning.summary` opt-in                                  |
  | `@tanstack/ai-grok` `grokText`                             | Chat Completions | `delta.reasoning_content` (DeepSeek convention; not typed by OpenAI SDK)                                         |
  | `@tanstack/ai-groq` `groqText`                             | Chat Completions | `delta.reasoning` (requires `reasoning_format: 'parsed'`; not typed by groq-sdk)                                 |
  | `@tanstack/ai-openrouter` `openRouterText`                 | Chat Completions | `delta.reasoningDetails` (camelCase)                                                                             |
  | `@tanstack/ai-openrouter` `openRouterResponsesText` (beta) | Responses (beta) | `response.reasoning_text.delta` + `response.reasoning_summary_text.delta` via `normalizeStreamEvent`             |

  All six emit the contractual `REASONING_*` lifecycle (`REASONING_START` → `REASONING_MESSAGE_START` → `REASONING_MESSAGE_CONTENT` deltas → `REASONING_MESSAGE_END` → `REASONING_END`) and close it before `TEXT_MESSAGE_START`. Accumulated reasoning is also surfaced on `structured-output.complete.value.reasoning` for consumers that only subscribe to the terminal event. OpenRouter SDK's proprietary `RequestAbortedError` is mapped (alongside DOM `AbortError`) to `code: 'aborted'` in the two openrouter adapters.

  `@tanstack/ai-openai` also exports a new `OpenAIChatCompletionsTextAdapter` / `openaiChatCompletions` / `createOpenaiChatCompletions` factory — a sibling to the existing Responses adapter for callers who want the older `/v1/chat/completions` wire format against the OpenAI SDK.

  ## Decouple `@tanstack/ai-openrouter` from the OpenAI base

  OpenRouter ships its own SDK (`@openrouter/sdk`) with a camelCase shape, so inheriting from the OpenAI-shaped base forced a snake_case ↔ camelCase round-trip on every request and stream event. ai-openrouter now extends `BaseTextAdapter` directly and inlines its own stream processors (`OpenRouterTextAdapter` for chat-completions, `OpenRouterResponsesTextAdapter` for the Responses beta), reading OpenRouter's camelCase types natively. The `@tanstack/openai-base` and `openai` dependencies are removed from ai-openrouter; only `@openrouter/sdk`, `@tanstack/ai`, and `@tanstack/ai-utils` remain. The ~300 LOC of inbound/outbound shape converters (`toOpenRouterRequest`, `toChatCompletion`, `adaptOpenRouterStreamChunks`, `toSnakeResponseResult`, …) are gone. Internal: duck-typed `as { ... }` casts on stream chunks in `OpenRouterResponsesTextAdapter` are replaced with direct narrowing via the SDK's discriminated unions.

  Public OpenRouter API is unchanged: `openRouterText`, `openRouterResponsesText`, `createOpenRouterText`, `createOpenRouterResponsesText`, the OpenRouter tool factories, provider routing surface (`provider`, `models`, `plugins`, `variant`, `transforms`), app attribution headers (`httpReferer`, `appTitle`), `:variant` model suffixing, `RequestAbortedError` propagation, and the OpenRouter-specific structured-output null-preservation all behave the same.

  `ai-ollama` remains on `BaseTextAdapter` directly — its native API uses a different wire format from Chat Completions and was never on the shared base.

  ## Summarize subsystem

  Anthropic, Gemini, Ollama, and OpenRouter previously each shipped a bespoke 200–300 LOC summarize adapter. They now construct a `ChatStreamSummarizeAdapter` (formerly `ChatStreamWrapperAdapter`, renamed and exported from `@tanstack/ai/activities`) wrapping their own text adapter, matching the existing OpenAI/Grok pattern. Removes ~600 LOC of duplicated logic across the six providers and ensures behavioural parity.

  Bespoke `*SummarizeProviderOptions` interfaces (e.g. `OpenAISummarizeProviderOptions`, `AnthropicSummarizeProviderOptions`, `GeminiSummarizeProviderOptions`, `OllamaSummarizeProviderOptions`, `OpenRouterSummarizeProviderOptions`) are removed from the provider packages' public exports. Consumers who imported them should switch to inferring the type from the adapter (`InferTextProviderOptions<typeof adapter>`) or remove the explicit annotation (it'll be inferred from the adapter argument).

  `SummarizeAdapter` interface methods are now generic in `TProviderOptions`. `summarize` and `summarizeStream` previously took `SummarizationOptions` (defaulted, so `modelOptions` was effectively `Record<string, any>` regardless of the adapter's typed shape). They now take `SummarizationOptions<TProviderOptions>`. Source-compatible for callers that didn't specify the generic; type-tighter for implementers and downstream consumers. `SummarizationOptions`, `SummarizeAdapter`, `BaseSummarizeAdapter`, and `ChatStreamSummarizeAdapter` previously had a mixed `Record<string, any>` / `Record<string, unknown>` / `object` set of defaults for `TProviderOptions`; they now uniformly default to `Record<string, unknown>`.

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec), [`02527c2`](https://github.com/TanStack/ai/commit/02527c28c3285829535cd486e529e659260b3c5d)]:
  - @tanstack/ai@0.17.0

## 0.10.3

### Patch Changes

- fix(ai-gemini): read/write thoughtSignature at Part level + thread typed metadata through tool-call lifecycle ([#459](https://github.com/TanStack/ai/pull/459))

  Two fixes shipped together because the adapter fix is only effective once the framework also preserves provider metadata across the tool-call round-trip.

  **Adapter (Gemini):** Gemini emits `thoughtSignature` as a Part-level sibling of `functionCall` (per the `@google/genai` `Part` type definition), not nested inside `functionCall`. The `FunctionCall` type has never had a `thoughtSignature` property. The adapter was reading from `functionCall.thoughtSignature` (does not exist in SDK types) and writing it back nested inside `functionCall`, causing Gemini 3.x to reject subsequent tool-call turns with `400 INVALID_ARGUMENT: "Function call is missing a thought_signature"`.
  - **Read side:** reads `part.thoughtSignature` directly using the SDK's typed `Part` interface
  - **Write side:** emits `thoughtSignature` as a Part-level sibling of `functionCall`

  **Framework (typed tool-call metadata):**
  - `ToolCall.providerMetadata: Record<string, unknown>` is now `ToolCall<TMetadata>.metadata?: TMetadata`, mirroring the existing typed-metadata pattern on content parts (`ImagePart<TMetadata>`, `AudioPart<TMetadata>`, etc.).
  - `ToolCallPart` gains a typed `metadata?: TMetadata` field (also generic).
  - `ToolCallStartEvent.providerMetadata` becomes `metadata` (kept as `Record<string, unknown>` because the AGUIEvent discriminated union does not survive a generic on the event type; adapters cast to their typed shape when emitting).
  - `BaseTextAdapter` and `TextAdapter` gain a sixth generic `TToolCallMetadata` (default `unknown`), exposed via `~types.toolCallMetadata` for inference at call sites.
  - `InternalToolCallState` gains a `metadata?: Record<string, unknown>` field captured at `TOOL_CALL_START` and threaded through `updateToolCallPart`, `buildAssistantMessages`, `modelMessageToUIMessage`, and `completeToolCall`, fixing a previously-silent drop of provider metadata across the client-side UIMessage pipeline (closes the gap surfaced in #403/#404).

  **Gemini concrete impl:** new `GeminiToolCallMetadata { thoughtSignature?: string }` exported from `@tanstack/ai-gemini`. The adapter declares its `TToolCallMetadata` as this type, so consumers see `toolCall.metadata?.thoughtSignature` typed end-to-end.

  **Breaking:** consumers reading `toolCall.providerMetadata` or `toolCallStartEvent.providerMetadata` should rename to `metadata`.

- Updated dependencies [[`87f305c`](https://github.com/TanStack/ai/commit/87f305c9961d608fd7bea93a5100698a98aed11d)]:
  - @tanstack/ai@0.16.0

## 0.10.2

### Patch Changes

- Internal refactor: every provider now delegates `getApiKeyFromEnv` / `generateId` / `transformNullsToUndefined` / `ModelMeta` helpers to the new `@tanstack/ai-utils` package. `ai-openai` and `ai-grok` additionally inherit OpenAI-compatible adapter base classes (Chat Completions / Responses text, image, summarize, transcription, TTS, video) from the new `@tanstack/openai-base` package; `ai-groq` keeps its own `BaseTextAdapter`-derived text adapter (Groq uses the `groq-sdk`, not the OpenAI SDK) but consumes `@tanstack/openai-base`'s schema converter and tool converters. The remaining providers (`ai-anthropic`, `ai-gemini`, `ai-ollama`, `ai-openrouter`, `ai-fal`, `ai-elevenlabs`) only consume `@tanstack/ai-utils` because they speak provider-native protocols, not OpenAI-compatible ones. No breaking changes — all public APIs remain identical. ([#409](https://github.com/TanStack/ai/pull/409))

- Updated dependencies [[`27c9aeb`](https://github.com/TanStack/ai/commit/27c9aeb80993f8262e65ef623a4cc6dadf18817e)]:
  - @tanstack/ai-utils@0.2.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`a4e2c55`](https://github.com/TanStack/ai/commit/a4e2c55a79490c2245ff2de2d3e1803a533c867b), [`82078bd`](https://github.com/TanStack/ai/commit/82078bdabe28d7d4a15a2847d667f363bf0a9cbe), [`b2d3cc1`](https://github.com/TanStack/ai/commit/b2d3cc131a31c54bd1e5841f958fbe333514e508)]:
  - @tanstack/ai@0.15.0

## 0.10.0

### Minor Changes

- feat(ai-gemini): add Lyria 3 Pro / Clip audio adapter and Gemini 3.1 Flash TTS ([#463](https://github.com/TanStack/ai/pull/463))

  **New adapter:**
  - `geminiAudio()` for Google Lyria music generation — supports `lyria-3-pro-preview` (full-length songs, MP3/WAV 48 kHz stereo) and `lyria-3-clip-preview` (30-second MP3 clips)

  **Enhanced:**
  - Added `gemini-3.1-flash-tts-preview` to the TTS model list (70+ languages, 200+ audio tags for expressive control)
  - Added `multiSpeakerVoiceConfig` to `GeminiTTSProviderOptions` for 2-speaker dialogue generation

### Patch Changes

- Tighten `GeneratedImage` and `GeneratedAudio` to enforce exactly one of `url` or `b64Json` via a mutually-exclusive `GeneratedMediaSource` union. ([#463](https://github.com/TanStack/ai/pull/463))

  Both types previously declared `url?` and `b64Json?` as independently optional, which allowed meaningless `{}` values and objects that set both fields. They now require exactly one:

  ```ts
  type GeneratedMediaSource =
    { url: string; b64Json?: never } | { b64Json: string; url?: never }
  ```

  Existing read patterns like `img.url || \`data:image/png;base64,${img.b64Json}\``continue to work unchanged. The only runtime-visible change is that the`@tanstack/ai-openrouter`and`@tanstack/ai-fal`image adapters no longer populate`url`with a synthesized`data:image/png;base64,...`URI when the provider returns base64 — they return`{ b64Json }`only. Consumers that want a data URI should build it from`b64Json` at render time.

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a)]:
  - @tanstack/ai@0.14.0

## 0.9.1

### Patch Changes

- Wire each adapter's text, summarize, image, speech, transcription, and video paths through the new `InternalLogger` from `@tanstack/ai/adapter-internals`: `logger.request(...)` before each SDK call, `logger.provider(...)` for every chunk received, and `logger.errors(...)` in catch blocks. Migrates all pre-existing ad-hoc `console.*` calls in adapter catch blocks (including the OpenAI and ElevenLabs realtime adapters) onto the structured logger. No adapter factory or config-shape changes. ([#467](https://github.com/TanStack/ai/pull/467))

- Updated dependencies [[`c1fd96f`](https://github.com/TanStack/ai/commit/c1fd96ffbcee1372ab039127903162bdf5543dd9)]:
  - @tanstack/ai@0.13.0

## 0.9.0

### Minor Changes

- Expose provider-tool factories (`codeExecutionTool`, `fileSearchTool`, `googleSearchTool`, `googleSearchRetrievalTool`, `googleMapsTool`, `urlContextTool`, `computerUseTool`) on a new `/tools` subpath, each returning a branded type gated against the selected model's `supports.tools` list. ([#466](https://github.com/TanStack/ai/pull/466))

  Note: `supports.capabilities` entries that described tools (`code_execution`, `file_search`, `grounding_with_gmaps` → renamed `google_maps`, `search_grounding` → renamed `google_search`, `url_context`) have been relocated to the new `supports.tools` field. The `capabilities` array loses those entries. This is a model-meta shape change but not a runtime break.

### Patch Changes

- Updated dependencies [[`e32583e`](https://github.com/TanStack/ai/commit/e32583e7612cede932baee6a79355e96e7124d90)]:
  - @tanstack/ai@0.12.0

## 0.8.9

### Patch Changes

- Align stream output with `@tanstack/ai`'s AG-UI-compliant event shapes: emit `REASONING_*` events alongside `STEP_*`, thread `threadId`/`runId` through `RUN_STARTED`/`RUN_FINISHED`, and return flat `RunErrorEvent` shape. Cast raw events through an internal `asChunk` helper so they line up with the re-exported `@ag-ui/core` `EventType` enum. No changes to adapter factory signatures or config shapes. ([#474](https://github.com/TanStack/ai/pull/474))

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7)]:
  - @tanstack/ai@0.11.0

## 0.8.8

### Patch Changes

- fix(ai, ai-openai, ai-gemini, ai-ollama): normalize null tool input to empty object ([#430](https://github.com/TanStack/ai/pull/430))

  When a model produces a `tool_use` block with no input, `JSON.parse('null')` returns `null` which fails Zod schema validation and silently kills the agent loop. Normalize null/non-object parsed tool input to `{}` in `executeToolCalls`, `ToolCallManager.completeToolCall`, `ToolCallManager.executeTools`, and the OpenAI/Gemini/Ollama adapter `TOOL_CALL_END` emissions. The Anthropic adapter already had this fix.

- Updated dependencies [[`c780bc1`](https://github.com/TanStack/ai/commit/c780bc127755ecf7e900343bf0e4d4823ff526ca)]:
  - @tanstack/ai@0.10.3

## 0.8.7

### Patch Changes

- Fix 400 error when sending tool results to Gemini API by removing redundant text part from functionResponse messages. Newer models (gemini-3.1-flash-lite, gemma-4) reject messages that mix text and functionResponse parts. ([#448](https://github.com/TanStack/ai/pull/448))

## 0.8.6

### Patch Changes

- Update model metadata from OpenRouter API ([#433](https://github.com/TanStack/ai/pull/433))

## 0.8.5

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai@0.10.0

## 0.8.4

### Patch Changes

- Fix Gemini adapter tool call handling: preserve thoughtSignature for Gemini 3+ thinking models through the tool call lifecycle, use correct function name (instead of call ID) in functionResponse parts, and include the call ID in both functionCall and functionResponse for proper correlation. ([#401](https://github.com/TanStack/ai/pull/401))

- Updated dependencies [[`b8cc69e`](https://github.com/TanStack/ai/commit/b8cc69e15eda49ce68cc48848284b0d74a55a97c)]:
  - @tanstack/ai@0.9.1

## 0.8.3

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0

## 0.8.2

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0

## 0.8.1

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0

## 0.8.0

### Minor Changes

- feat: add support for Gemini 3.1 Flash Lite Preview model ([#351](https://github.com/TanStack/ai/pull/351))

  Added `gemini-3.1-flash-lite-preview` to the Gemini adapter with:
  - Full multimodal support (text, image, audio, video, document)
  - Thinking and structured output capabilities
  - Available for summarization tasks
  - Comprehensive type tests

  Model specs:
  - 1M input tokens, 65K output tokens
  - $0.25/1M input, $1.50/1M output pricing
  - Knowledge cutoff: 2025-01-01

## 0.7.0

### Minor Changes

- - Add NanoBanana native image generation with up to 4K image output, routing all gemini-\* native image models through generateContent API ([#321](https://github.com/TanStack/ai/pull/321))
  - Fix SDK property names (imageGenerationConfig → imageConfig, outputImageSize → imageSize) and rename NanoBanana types to GeminiNativeImage
  - Add Gemini 3.1 Pro model support for text generation

## 0.6.0

### Patch Changes

- Updated dependencies [[`5aa6acc`](https://github.com/TanStack/ai/commit/5aa6acc1a4faea5346f750322e80984abf2d7059), [`1f800aa`](https://github.com/TanStack/ai/commit/1f800aacf57081f37a075bc8d08ff397cb33cbe9)]:
  - @tanstack/ai@0.6.0

## 0.5.0

### Minor Changes

- Tighten the AG-UI adapter contract and simplify the core stream processor. ([#275](https://github.com/TanStack/ai/pull/275))

  **Breaking type changes:**
  - `TextMessageContentEvent.delta` is now required (was optional)
  - `StepFinishedEvent.delta` is now required (was optional)

  All first-party adapters already sent `delta` on every event, so this is a type-level enforcement of existing behavior. Community adapters that follow the reference implementations will not need code changes.

  **Core processor simplifications:**
  - `TEXT_MESSAGE_START` now resets text segment state, replacing heuristic overlap detection
  - `TOOL_CALL_END` is now the authoritative signal for tool call input completion
  - Removed delta/content fallback logic, whitespace-only message cleanup, and finish-reason conflict arbitration from the processor

  **Adapter fixes:**
  - Gemini: filter whitespace-only text parts, fix STEP_FINISHED content accumulation, emit fresh TEXT_MESSAGE_START after tool calls
  - Anthropic: emit fresh TEXT_MESSAGE_START after tool_use blocks for proper text segmentation

### Patch Changes

- fix(ai, ai-client, ai-anthropic, ai-gemini): fix multi-turn conversations failing after tool calls ([#275](https://github.com/TanStack/ai/pull/275))

  **Core (@tanstack/ai):**
  - Lazy assistant message creation: `StreamProcessor` now defers creating the assistant message until the first content-bearing chunk arrives (text, tool call, thinking, or error), eliminating empty `parts: []` messages from appearing during auto-continuation when the model returns no content
  - Add `prepareAssistantMessage()` (lazy) alongside deprecated `startAssistantMessage()` (eager, backwards-compatible)
  - Add `getCurrentAssistantMessageId()` to check if a message was created
  - **Rewrite `uiMessageToModelMessages()` to preserve part ordering**: the function now walks parts sequentially instead of separating by type, producing correctly interleaved assistant/tool messages (text1 + toolCall1 → toolResult1 → text2 + toolCall2 → toolResult2) instead of concatenating all text and batching all tool calls. This fixes multi-round tool flows where the model would see garbled conversation history and re-call tools unnecessarily.
  - Deduplicate tool result messages: when a client tool has both a `tool-result` part and a `tool-call` part with `output`, only one `role: 'tool'` message is emitted per tool call ID

  **Client (@tanstack/ai-client):**
  - Update `ChatClient.processStream()` to use lazy assistant message creation, preventing UI flicker from empty messages being created then removed

  **Anthropic:**
  - Fix consecutive user-role messages violating Anthropic's alternating role requirement by merging them in `formatMessages`
  - Deduplicate `tool_result` blocks with the same `tool_use_id`
  - Filter out empty assistant messages from conversation history
  - Suppress duplicate `RUN_FINISHED` event from `message_stop` when `message_delta` already emitted one
  - Fix `TEXT_MESSAGE_END` incorrectly emitting for `tool_use` content blocks
  - Add Claude Opus 4.6 model support with adaptive thinking and effort parameter

  **Gemini:**
  - Fix consecutive user-role messages violating Gemini's alternating role requirement by merging them in `formatMessages`
  - Deduplicate `functionResponse` parts with the same name (tool call ID)
  - Filter out empty model messages from conversation history

- Updated dependencies [[`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd), [`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd)]:
  - @tanstack/ai@0.5.0

## 0.4.1

### Patch Changes

- Add in opus 4.6 and enhance acceptable config options by providers ([#278](https://github.com/TanStack/ai/pull/278))

## 0.4.0

### Patch Changes

- re-release adapter packages ([#263](https://github.com/TanStack/ai/pull/263))

- add multiple modalities support to the client ([#263](https://github.com/TanStack/ai/pull/263))

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai@0.4.0

## 0.3.0

### Minor Changes

- feat: Add AG-UI protocol events to streaming system ([#244](https://github.com/TanStack/ai/pull/244))

  All text adapters now emit AG-UI protocol events only:
  - `RUN_STARTED` / `RUN_FINISHED` - Run lifecycle events
  - `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` - Text message streaming
  - `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` - Tool call streaming

  Only AG-UI event types are supported; previous legacy chunk formats (`content`, `tool_call`, `done`, etc.) are no longer accepted.

### Patch Changes

- Updated dependencies [[`e52135f`](https://github.com/TanStack/ai/commit/e52135f6ec3285227679411636e208ae84a408d7)]:
  - @tanstack/ai@0.3.0

## 0.3.2

### Patch Changes

- Fix thinking output for Gemini Text adapter ([#210](https://github.com/TanStack/ai/pull/210))

- fixed an issue with gemini and thought chunks processing ([#210](https://github.com/TanStack/ai/pull/210))

- Updated dependencies [[`7573619`](https://github.com/TanStack/ai/commit/7573619a234d1a50bd2ac098d64524447ebc5869)]:
  - @tanstack/ai@0.2.2

## 0.3.1

### Patch Changes

- fix: generate unique IDs for parallel function calls in Gemini adapter ([#199](https://github.com/TanStack/ai/pull/199))

## 0.3.0

### Minor Changes

- Add Gemini 3 Flash and Pro Image models for text and image generation ([#190](https://github.com/TanStack/ai/pull/190))

### Patch Changes

- fix up readmes ([#188](https://github.com/TanStack/ai/pull/188))

- Updated dependencies [[`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9), [`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9)]:
  - @tanstack/ai@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [[`c5df33c`](https://github.com/TanStack/ai/commit/c5df33c2d3e72c3332048ffe7c64a553e5ea86fb)]:
  - @tanstack/ai@0.2.0

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`52c3172`](https://github.com/TanStack/ai/commit/52c317244294a75b0c7f5e6cafc8583fbb6abfb7)]:
  - @tanstack/ai@0.0.3

## 0.0.2

### Patch Changes

- added text metadata support for message inputs ([#95](https://github.com/TanStack/ai/pull/95))

- Updated dependencies [[`64fda55`](https://github.com/TanStack/ai/commit/64fda55f839062bc67b8c24850123e879fdbf0b3)]:
  - @tanstack/ai@0.0.2

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))

- Updated dependencies [[`a9b54c2`](https://github.com/TanStack/ai/commit/a9b54c21282d16036a427761e0784b159a6f2d99)]:
  - @tanstack/ai@0.0.1
