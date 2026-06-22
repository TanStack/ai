# @tanstack/ai-openai

## 0.15.2

### Patch Changes

- Updated dependencies [[`22ccaaa`](https://github.com/TanStack/ai/commit/22ccaaa4fe018af5a1f34bfabc0480246b11bd14)]:
  - @tanstack/openai-base@0.8.7

## 0.15.1

### Patch Changes

- Updated dependencies [[`c55764a`](https://github.com/TanStack/ai/commit/c55764a4cb55a384dc50390191e4842a3e64604a)]:
  - @tanstack/openai-base@0.8.6

## 0.15.0

### Minor Changes

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
  - @tanstack/ai-client@0.18.0
  - @tanstack/openai-base@0.8.5

## 0.14.4

### Patch Changes

- Updated dependencies [[`07aaf8b`](https://github.com/TanStack/ai/commit/07aaf8b9e5a8e699be25f936cc9cd651a46c16c5)]:
  - @tanstack/ai@0.31.0
  - @tanstack/ai-client@0.17.3
  - @tanstack/openai-base@0.8.4

## 0.14.3

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`7103348`](https://github.com/TanStack/ai/commit/71033488212bff05dcccc857e721ab9262ebc2a6), [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai@0.30.0
  - @tanstack/ai-client@0.17.1
  - @tanstack/ai-utils@0.2.2
  - @tanstack/openai-base@0.8.3

## 0.14.2

### Patch Changes

- [#699](https://github.com/TanStack/ai/pull/699) [`215b6b4`](https://github.com/TanStack/ai/commit/215b6b401aa95d1d38da342aa09603cb1d616929) - Migrate the OpenAI realtime adapters from the retired Beta API (shut down 2026-05-12) to the GA API:
  - `openaiRealtime()` now exchanges WebRTC SDP via `POST /v1/realtime/calls` (the Beta `?model=` shape returned `beta_api_shape_disabled`).
  - `openaiRealtimeToken()` now mints ephemeral keys via `POST /v1/realtime/client_secrets` instead of the retired `/v1/realtime/sessions`, and parses the GA top-level `value`/`expires_at` response shape.
  - `session.update` payloads use the GA shape: required `session.type`, `audio.input.transcription`, `audio.input.turn_detection`, `audio.output.voice`, `output_modalities`, and `max_output_tokens`. `temperature` was removed from the GA session config and is no longer sent (a debug log notes when it is dropped).
  - Server events are handled under their GA names (`response.output_audio_transcript.*`, `response.output_audio.*`, `output_text`/`output_audio` content parts).
  - The default realtime model is now `gpt-realtime`; the `gpt-4o-(mini-)realtime-preview` ids (shut down by OpenAI on 2026-05-07) were removed from `OpenAIRealtimeModel`.

- Updated dependencies [[`ff267a5`](https://github.com/TanStack/ai/commit/ff267a5536327b006979f9f28ce2df7cc27f6e23), [`570c08a`](https://github.com/TanStack/ai/commit/570c08a8d1a35746c3d31a63188249cba2d2475a), [`22c9b42`](https://github.com/TanStack/ai/commit/22c9b42baec74914b720e440f29bd02be04eb164), [`215b6b4`](https://github.com/TanStack/ai/commit/215b6b401aa95d1d38da342aa09603cb1d616929), [`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0)]:
  - @tanstack/ai@0.29.0
  - @tanstack/ai-client@0.17.0
  - @tanstack/openai-base@0.8.2

## 0.14.1

### Patch Changes

- Updated dependencies [[`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6), [`c0af426`](https://github.com/TanStack/ai/commit/c0af4262d269be67c69d6f878d9618f25fdeee19), [`00e0c93`](https://github.com/TanStack/ai/commit/00e0c932e6cb5e31f75f4b5e94486d7eb02b9ce1), [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6), [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6)]:
  - @tanstack/ai@0.28.0
  - @tanstack/openai-base@0.8.1
  - @tanstack/ai-client@0.16.3

## 0.14.0

### Minor Changes

- [#695](https://github.com/TanStack/ai/pull/695) [`786b3e4`](https://github.com/TanStack/ai/commit/786b3e4d68815349f3157bdfea1791038c978519) - feat: attach hosted provider Skills to code-execution / shell tools

  Hosted, provider-managed Agent Skills can now be attached to the server-side execution tool that runs them:
  - **Anthropic** — `codeExecutionTool(config, { skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }] })`. The adapter lifts the skills into the request's top-level `container.skills` and automatically attaches the required beta headers (`code-execution-2025-08-25` — or `code-execution-2025-05-22` for the legacy `code_execution_20250522` variant — plus `skills-2025-10-02`).
  - **OpenAI** — `shellTool({ environment: { type: 'container_auto', skills: [{ type: 'skill_reference', skill_id: '...', version: '2' }] } })`, threaded through the Responses API shell tool.

  Scope: hosted/managed skills referenced by id + version. Skills are inert without the execution tool that runs them.

  Setting skills via Anthropic's `modelOptions.container.skills` is deprecated in favor of `codeExecutionTool(config, { skills })`.

  Bumps the `openai` SDK to `^6.41.0` (required for the typed shell `environment.skills` surface).

### Patch Changes

- Updated dependencies [[`786b3e4`](https://github.com/TanStack/ai/commit/786b3e4d68815349f3157bdfea1791038c978519)]:
  - @tanstack/openai-base@0.8.0

## 0.13.0

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
  - @tanstack/openai-base@0.7.0
  - @tanstack/ai-client@0.16.2

## 0.12.1

### Patch Changes

- Updated dependencies [[`755e995`](https://github.com/TanStack/ai/commit/755e9953a31e879c4b88df0e7672ce1224886c97)]:
  - @tanstack/ai-client@0.16.0

## 0.12.0

### Minor Changes

- [#676](https://github.com/TanStack/ai/pull/676) [`5d6cd28`](https://github.com/TanStack/ai/commit/5d6cd2834ba7ac1d7c7c1bd24ede202bf3e78010) - Add `openaiCompatible({ baseURL, apiKey, models })` provider-factory and `openaiCompatibleText` one-shot helper (exported from `@tanstack/ai-openai/compatible`) for any OpenAI-Chat-Completions-compatible endpoint — DeepSeek, Moonshot/Kimi, Together, Fireworks, Cerebras, Qwen, Perplexity, local servers, and more. Per-model type safety via a hybrid `models` array (bare strings get optimistic defaults; `createModel()` defs declare precise capabilities), with an optional `api: 'responses'` toggle.

### Patch Changes

- Updated dependencies [[`5d6cd28`](https://github.com/TanStack/ai/commit/5d6cd2834ba7ac1d7c7c1bd24ede202bf3e78010)]:
  - @tanstack/ai@0.26.0
  - @tanstack/ai-client@0.15.2
  - @tanstack/openai-base@0.6.1

## 0.11.0

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
  - @tanstack/openai-base@0.6.0
  - @tanstack/ai-client@0.15.1

## 0.10.5

### Patch Changes

- Updated dependencies [[`c1ae8b9`](https://github.com/TanStack/ai/commit/c1ae8b94c83d70508975568eb4fc9b45f1af540b), [`a452ae8`](https://github.com/TanStack/ai/commit/a452ae8bcda8abfdc6309983976ed0fbf6df1915), [`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai@0.24.0
  - @tanstack/ai-client@0.15.0
  - @tanstack/openai-base@0.5.0

## 0.10.4

### Patch Changes

- Updated dependencies [[`980ff9b`](https://github.com/TanStack/ai/commit/980ff9ba925f5dbae62a9318cc1e787d0ae24314), [`d5645cf`](https://github.com/TanStack/ai/commit/d5645cfd4d1b9cfc877f7d4d714517e166a99ce3)]:
  - @tanstack/ai@0.23.0
  - @tanstack/ai-client@0.14.0
  - @tanstack/openai-base@0.4.1

## 0.10.3

### Patch Changes

- Updated dependencies [[`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855)]:
  - @tanstack/ai-client@0.13.0
  - @tanstack/ai@0.22.1
  - @tanstack/openai-base@0.4.0

## 0.10.2

### Patch Changes

- Updated dependencies [[`ad23da9`](https://github.com/TanStack/ai/commit/ad23da92c279759b3778672dcee3d1616a02994b)]:
  - @tanstack/ai-client@0.12.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`02f7d04`](https://github.com/TanStack/ai/commit/02f7d0427a406bd2dda6f5a51d1ef1d2600d5ac9)]:
  - @tanstack/ai@0.22.0
  - @tanstack/openai-base@0.4.0
  - @tanstack/ai-client@0.11.8

## 0.10.0

### Minor Changes

- Add `gpt-image-2` to the OpenAI image model list. The new model is exposed ([#625](https://github.com/TanStack/ai/pull/625))
  through the same tree-shakeable `openaiImage` adapter as `gpt-image-1` and
  shares its provider options (`quality`, `background`, `output_format`,
  `output_compression`, `moderation`, `partial_images`) and size set
  (`1024x1024`, `1536x1024`, `1024x1536`, `auto`).

  ```ts
  import { openaiImage } from '@tanstack/ai-openai/adapters'
  import { generate } from '@tanstack/ai'

  const adapter = openaiImage({ apiKey: process.env.OPENAI_API_KEY! })

  const result = await generate({
    adapter,
    model: 'gpt-image-2',
    prompt: 'A watercolor fox in a snowy forest',
  })
  ```

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai@0.21.2
  - @tanstack/ai-client@0.11.6
  - @tanstack/ai-utils@0.2.1
  - @tanstack/openai-base@0.3.6

## 0.9.6

### Patch Changes

- Adopt `@tanstack/eslint-config@0.4.0` and clean up the local override layer. ([#607](https://github.com/TanStack/ai/pull/607))
  - Bump `@tanstack/eslint-config` from `0.3.3` to `0.4.0`.
  - Drop dead `pnpm/enforce-catalog` and `pnpm/json-enforce-catalog` disables (upstream removed `eslint-plugin-pnpm` in `0.3.1`).
  - Drop the `no-case-declarations: off` override — no current source actually violates it.
  - Drop the `no-shadow: off` override — upstream sets it to `warn`, so it surfaces in editors without blocking CI.
  - Remove ~25 unnecessary type assertions across the publishable packages that the upgraded `typescript-eslint` now catches via `no-unnecessary-type-assertion`. One deliberately defensive cast in `ag-ui-wire.ts` is preserved with an inline opt-out and a reason comment.

  No public-API or runtime-behavior changes.

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529), [`a03d12b`](https://github.com/TanStack/ai/commit/a03d12b13ade93f3e262c6ffa996696ce27472ef), [`188fe11`](https://github.com/TanStack/ai/commit/188fe11b9b9691e5a241cfc416803da5b8ce5376)]:
  - @tanstack/ai@0.21.0
  - @tanstack/ai-client@0.11.4
  - @tanstack/openai-base@0.3.5

## 0.9.5

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
  - @tanstack/openai-base@0.3.4
  - @tanstack/ai-client@0.11.3

## 0.9.4

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
  - @tanstack/openai-base@0.3.3
  - @tanstack/ai-client@0.11.2

## 0.9.3

### Patch Changes

- Update model metadata from OpenRouter API ([#581](https://github.com/TanStack/ai/pull/581))

## 0.9.2

### Patch Changes

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49)]:
  - @tanstack/ai@0.19.0
  - @tanstack/ai-client@0.11.0
  - @tanstack/openai-base@0.3.2

## 0.9.1

### Patch Changes

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099), [`e810153`](https://github.com/TanStack/ai/commit/e810153b34e593d3f3e1bbd8050164a6ad4423ed)]:
  - @tanstack/ai@0.18.0
  - @tanstack/ai-client@0.10.0
  - @tanstack/openai-base@0.3.1

## 0.9.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec), [`02527c2`](https://github.com/TanStack/ai/commit/02527c28c3285829535cd486e529e659260b3c5d)]:
  - @tanstack/ai@0.17.0
  - @tanstack/openai-base@0.3.0
  - @tanstack/ai-client@0.9.2

## 0.8.5

### Patch Changes

- Updated dependencies [[`87f305c`](https://github.com/TanStack/ai/commit/87f305c9961d608fd7bea93a5100698a98aed11d)]:
  - @tanstack/ai@0.16.0
  - @tanstack/ai-client@0.9.1
  - @tanstack/openai-base@0.2.1

## 0.8.4

### Patch Changes

- Internal refactor: every provider now delegates `getApiKeyFromEnv` / `generateId` / `transformNullsToUndefined` / `ModelMeta` helpers to the new `@tanstack/ai-utils` package. `ai-openai` and `ai-grok` additionally inherit OpenAI-compatible adapter base classes (Chat Completions / Responses text, image, summarize, transcription, TTS, video) from the new `@tanstack/openai-base` package; `ai-groq` keeps its own `BaseTextAdapter`-derived text adapter (Groq uses the `groq-sdk`, not the OpenAI SDK) but consumes `@tanstack/openai-base`'s schema converter and tool converters. The remaining providers (`ai-anthropic`, `ai-gemini`, `ai-ollama`, `ai-openrouter`, `ai-fal`, `ai-elevenlabs`) only consume `@tanstack/ai-utils` because they speak provider-native protocols, not OpenAI-compatible ones. No breaking changes — all public APIs remain identical. ([#409](https://github.com/TanStack/ai/pull/409))

- Updated dependencies [[`27c9aeb`](https://github.com/TanStack/ai/commit/27c9aeb80993f8262e65ef623a4cc6dadf18817e), [`27c9aeb`](https://github.com/TanStack/ai/commit/27c9aeb80993f8262e65ef623a4cc6dadf18817e)]:
  - @tanstack/ai-utils@0.2.0
  - @tanstack/openai-base@0.2.0

## 0.8.3

### Patch Changes

- Updated dependencies [[`a4e2c55`](https://github.com/TanStack/ai/commit/a4e2c55a79490c2245ff2de2d3e1803a533c867b), [`82078bd`](https://github.com/TanStack/ai/commit/82078bdabe28d7d4a15a2847d667f363bf0a9cbe), [`b2d3cc1`](https://github.com/TanStack/ai/commit/b2d3cc131a31c54bd1e5841f958fbe333514e508), [`13cceae`](https://github.com/TanStack/ai/commit/13cceaedf64e398ca15b8dbbbfe215329ea26794)]:
  - @tanstack/ai@0.15.0
  - @tanstack/ai-client@0.9.0

## 0.8.2

### Patch Changes

- refactor(ai, ai-openai): narrow error handling before logging ([#465](https://github.com/TanStack/ai/pull/465))

  `catch (error: any)` sites in `stream-to-response.ts`, `activities/stream-generation-result.ts`, and `activities/generateVideo/index.ts` are now narrowed to `unknown` and funnel through a shared `toRunErrorPayload(error, fallback)` helper that extracts `message` / `code` without leaking the original error object (which can carry request state from an SDK).

  Replaced four `console.error` calls in the OpenAI text adapter's `chatStream` catch block that dumped the full error object to stdout. SDK errors can carry the original request including auth headers, so the library now logs only the narrowed `{ message, code }` payload via the internal logger — any user-supplied logger receives the sanitized shape, not the raw SDK error.

- Tighten `GeneratedImage` and `GeneratedAudio` to enforce exactly one of `url` or `b64Json` via a mutually-exclusive `GeneratedMediaSource` union. ([#463](https://github.com/TanStack/ai/pull/463))

  Both types previously declared `url?` and `b64Json?` as independently optional, which allowed meaningless `{}` values and objects that set both fields. They now require exactly one:

  ```ts
  type GeneratedMediaSource =
    | { url: string; b64Json?: never }
    | { b64Json: string; url?: never }
  ```

  Existing read patterns like `img.url || \`data:image/png;base64,${img.b64Json}\``continue to work unchanged. The only runtime-visible change is that the`@tanstack/ai-openrouter`and`@tanstack/ai-fal`image adapters no longer populate`url`with a synthesized`data:image/png;base64,...`URI when the provider returns base64 — they return`{ b64Json }`only. Consumers that want a data URI should build it from`b64Json` at render time.

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1), [`008f015`](https://github.com/TanStack/ai/commit/008f0154f852e7e6734d3e3d35cad47780b52b7a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a)]:
  - @tanstack/ai@0.14.0
  - @tanstack/ai-client@0.8.0

## 0.8.1

### Patch Changes

- Wire each adapter's text, summarize, image, speech, transcription, and video paths through the new `InternalLogger` from `@tanstack/ai/adapter-internals`: `logger.request(...)` before each SDK call, `logger.provider(...)` for every chunk received, and `logger.errors(...)` in catch blocks. Migrates all pre-existing ad-hoc `console.*` calls in adapter catch blocks (including the OpenAI and ElevenLabs realtime adapters) onto the structured logger. No adapter factory or config-shape changes. ([#467](https://github.com/TanStack/ai/pull/467))

- Updated dependencies [[`c1fd96f`](https://github.com/TanStack/ai/commit/c1fd96ffbcee1372ab039127903162bdf5543dd9)]:
  - @tanstack/ai@0.13.0
  - @tanstack/ai-client@0.7.14

## 0.8.0

### Minor Changes

- Expose provider-tool factories (`webSearchTool`, `webSearchPreviewTool`, `fileSearchTool`, `imageGenerationTool`, `codeInterpreterTool`, `mcpTool`, `computerUseTool`, `localShellTool`, `shellTool`, `applyPatchTool`, `customTool`) on a new `/tools` subpath. Each factory returns a branded type (e.g. `OpenAIWebSearchTool`) gated against the selected model's `supports.tools` list. `supports.tools` was expanded to include `web_search_preview`, `local_shell`, `shell`, `apply_patch`. Existing factory signatures and runtime behavior are unchanged. ([#466](https://github.com/TanStack/ai/pull/466))

### Patch Changes

- Updated dependencies [[`e32583e`](https://github.com/TanStack/ai/commit/e32583e7612cede932baee6a79355e96e7124d90)]:
  - @tanstack/ai@0.12.0
  - @tanstack/ai-client@0.7.13

## 0.7.6

### Patch Changes

- Align stream output with `@tanstack/ai`'s AG-UI-compliant event shapes: emit `REASONING_*` events alongside `STEP_*`, thread `threadId`/`runId` through `RUN_STARTED`/`RUN_FINISHED`, and return flat `RunErrorEvent` shape. Cast raw events through an internal `asChunk` helper so they line up with the re-exported `@ag-ui/core` `EventType` enum. No changes to adapter factory signatures or config shapes. ([#474](https://github.com/TanStack/ai/pull/474))

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7), [`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7), [`1d6f3be`](https://github.com/TanStack/ai/commit/1d6f3bef4fd1c4917823612fbcd9450a0fd2e627)]:
  - @tanstack/ai@0.11.0
  - @tanstack/ai-client@0.7.11

## 0.7.5

### Patch Changes

- fix(ai, ai-openai, ai-gemini, ai-ollama): normalize null tool input to empty object ([#430](https://github.com/TanStack/ai/pull/430))

  When a model produces a `tool_use` block with no input, `JSON.parse('null')` returns `null` which fails Zod schema validation and silently kills the agent loop. Normalize null/non-object parsed tool input to `{}` in `executeToolCalls`, `ToolCallManager.completeToolCall`, `ToolCallManager.executeTools`, and the OpenAI/Gemini/Ollama adapter `TOOL_CALL_END` emissions. The Anthropic adapter already had this fix.

- Updated dependencies [[`c780bc1`](https://github.com/TanStack/ai/commit/c780bc127755ecf7e900343bf0e4d4823ff526ca)]:
  - @tanstack/ai@0.10.3
  - @tanstack/ai-client@0.7.10

## 0.7.4

### Patch Changes

- Update model metadata from OpenRouter API ([#433](https://github.com/TanStack/ai/pull/433))

## 0.7.3

### Patch Changes

- Add code mode and isolate packages for secure AI code execution ([#362](https://github.com/TanStack/ai/pull/362))

  Also includes fixes for Ollama tool call argument streaming and usage
  reporting, OpenAI realtime adapter handling of missing call_id/item_id,
  realtime client guards for missing toolCallId, and new DevtoolsChatMiddleware
  type export from ai-event-client.

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai@0.10.0
  - @tanstack/ai-client@0.7.7

## 0.7.2

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0
  - @tanstack/ai-client@0.7.3

## 0.7.1

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0
  - @tanstack/ai-client@0.7.1

## 0.7.0

### Minor Changes

- feat: add realtime voice chat with OpenAI and ElevenLabs adapters ([#300](https://github.com/TanStack/ai/pull/300))

  Adds realtime voice/text chat capabilities:
  - **@tanstack/ai**: `realtimeToken()` function and shared realtime types (`RealtimeToken`, `RealtimeMessage`, `RealtimeSessionConfig`, `RealtimeStatus`, `RealtimeMode`, `AudioVisualization`, events, and error types)
  - **@tanstack/ai-client**: Framework-agnostic `RealtimeClient` class with connection lifecycle, audio I/O, message state management, tool execution, and `RealtimeAdapter`/`RealtimeConnection` interfaces
  - **@tanstack/ai-openai**: `openaiRealtime()` client adapter (WebRTC) and `openaiRealtimeToken()` server token adapter with support for semantic VAD, multiple voices, and all realtime models
  - **@tanstack/ai-elevenlabs**: `elevenlabsRealtime()` client adapter (WebSocket) and `elevenlabsRealtimeToken()` server token adapter for ElevenLabs conversational AI agents
  - **@tanstack/ai-react**: `useRealtimeChat()` hook with reactive state for status, mode, messages, pending transcripts, audio visualization levels, VAD control, text/image input, and interruptions
  - **Docs**: Realtime Voice Chat guide and full API reference for all realtime classes, interfaces, functions, and type aliases

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0
  - @tanstack/ai-client@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`5aa6acc`](https://github.com/TanStack/ai/commit/5aa6acc1a4faea5346f750322e80984abf2d7059), [`1f800aa`](https://github.com/TanStack/ai/commit/1f800aacf57081f37a075bc8d08ff397cb33cbe9)]:
  - @tanstack/ai@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd), [`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd)]:
  - @tanstack/ai@0.5.0

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

## 0.3.0

### Minor Changes

- allows additional configuration options when creating an openAI client ([#245](https://github.com/TanStack/ai/pull/245))

## 0.2.1

### Patch Changes

- Fix up model names for OpenAI and release the new response APIs ([#188](https://github.com/TanStack/ai/pull/188))

- fix up readmes ([#188](https://github.com/TanStack/ai/pull/188))

- Updated dependencies [[`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9), [`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9)]:
  - @tanstack/ai@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [[`c5df33c`](https://github.com/TanStack/ai/commit/c5df33c2d3e72c3332048ffe7c64a553e5ea86fb)]:
  - @tanstack/ai@0.2.0

## 0.1.1

### Patch Changes

- add support for gpt 5.2 models ([#166](https://github.com/TanStack/ai/pull/166))

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai@0.1.0

## 0.0.3

### Patch Changes

- Fix reasoning token streaming for `gpt-5-mini` and `gpt-5-nano` models ([#94](https://github.com/TanStack/ai/pull/94))
  - Added `OpenAIReasoningOptions` to type definitions for `gpt-5-mini` and `gpt-5-nano` models
  - Fixed `summary` option placement in `OpenAIReasoningOptions` (moved inside `reasoning` object to match OpenAI SDK)
  - Added handler for `response.reasoning_summary_text.delta` events to stream reasoning summaries
  - Added model-specific `reasoning.summary` types: `concise` only available for `computer-use-preview`
  - Added `OpenAIReasoningOptionsWithConcise` for `computer-use-preview` model

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
