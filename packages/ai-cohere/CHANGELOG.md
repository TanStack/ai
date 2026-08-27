# @tanstack/ai-cohere

## 0.3.1

### Patch Changes

- Updated dependencies [[`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b), [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b)]:
  - @tanstack/ai@0.50.0

## 0.3.0

### Minor Changes

- [#906](https://github.com/TanStack/ai/pull/906) [`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd) - Add headless BYOK: `defineByok` in `@tanstack/ai-client/byok`, pass `byok` into chat and generation hooks, and read keys on the relay with `getByokKey` from `@tanstack/ai/byok/server`. Provider ids are open slugs (`x-byok-<slug>`). Each adapter exports a `{ id, label, env? }` object (`openaiByok`, …); `id` is required. `env` is the env var name(s) for the relay — names only; the client never reads `process.env`. A wrong key surfaces as the provider's own `401` through the relay, so no client-side key check is needed. OpenRouter PKCE (`@tanstack/ai-openrouter/pkce`) saves the minted key under `openrouterByok.id`.

### Patch Changes

- Updated dependencies [[`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd)]:
  - @tanstack/ai@0.49.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`1c0415b`](https://github.com/TanStack/ai/commit/1c0415bec4bbefcd3abf784d0209af05aca5db46)]:
  - @tanstack/ai@0.48.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`5f68cbc`](https://github.com/TanStack/ai/commit/5f68cbccf3621b48dae73cedcb1e59cb4cbe72b4), [`32e62ab`](https://github.com/TanStack/ai/commit/32e62ab8b7dc6a8a13ca3851c8925ab806e08f29)]:
  - @tanstack/ai@0.47.0

## 0.2.0

### Minor Changes

- [#896](https://github.com/TanStack/ai/pull/896) [`41a5d18`](https://github.com/TanStack/ai/commit/41a5d189082331e052e1f2f5e987848501ffd08b) - Add a self-describing `billed` field to `TokenUsage` so billed quantities carry the unit they are counted in ([#816](https://github.com/TanStack/ai/issues/816)). `usage.billed` is `{ quantity, unit }` with a `BillingUnit` union (`'seconds'`, `'units'`, `'images'`, `'tokens'`, ... open-ended). The deprecated `unitsBilled` / `durationSeconds` counts are still populated for backward compatibility. The fal adapters report `{ quantity, unit: 'units' }`, Grok video `{ quantity, unit: 'seconds' }`, the OpenAI/Grok/BytePlus duration-billed transcription paths `{ quantity, unit: 'seconds' }`, BytePlus Seedream images `{ quantity, unit: 'images' }`, BytePlus Seedance video `{ quantity, unit: 'tokens' }`, and Cohere/OpenRouter rerank `{ quantity, unit: 'units' }` (search units). Persistence sums `billed` when both reports use the same unit. `otelMiddleware` emits the pair as `tanstack.ai.usage.billed_quantity` / `tanstack.ai.usage.billed_unit` span attributes.

### Patch Changes

- Updated dependencies [[`41a5d18`](https://github.com/TanStack/ai/commit/41a5d189082331e052e1f2f5e987848501ffd08b), [`4599019`](https://github.com/TanStack/ai/commit/4599019eb02f72562ef155b69b8f61f9d25d187a), [`3eda66c`](https://github.com/TanStack/ai/commit/3eda66cb132def6346829ba113f315ffdd4edf6b), [`ecd12a4`](https://github.com/TanStack/ai/commit/ecd12a408987bc75649c21aada6948282a2a66dd)]:
  - @tanstack/ai@0.46.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`d10dfe6`](https://github.com/TanStack/ai/commit/d10dfe6eca788ae52631d45e5599aa0c45e9ba37), [`eda82cc`](https://github.com/TanStack/ai/commit/eda82cc8a86923afd604a663d050c6edfa6b829b), [`c63319e`](https://github.com/TanStack/ai/commit/c63319e34a2ca2f1d56b90addf28784f7c3e13ad), [`b09e010`](https://github.com/TanStack/ai/commit/b09e010b32932c812e65b1e14f6faa2b0e6d5cb8), [`0fb8263`](https://github.com/TanStack/ai/commit/0fb826321c9ba7bd5d8ba0062be2a00b6178726d)]:
  - @tanstack/ai@0.45.0

## 0.1.0

### Minor Changes

- [#926](https://github.com/TanStack/ai/pull/926) [`ee07854`](https://github.com/TanStack/ai/commit/ee07854fd3d2d4bb279e6e4748802f7f9a5a7167) - Add a multimodal `embed()` activity. A single primitive covers one input or a batch — `input` accepts a string, a text part, an image part, or a fused text+image item written as a nested `Array<ContentPart>` (`[textPart, imagePart]`, the same shape chat messages use), one vector per item, with the accepted item types narrowed per model at compile time. Top-level `dimensions` requests Matryoshka output sizes where supported. Results carry `embeddings: [{ vector, index }]` plus `usage` when the provider reports it, and `embed()` participates in generation middleware, debug logging, OTel (`gen_ai.operation.name: embeddings`), and devtools events like every other activity.

  Provider adapters: `openaiEmbedding` (text-embedding-3-small/large), `geminiEmbedding` (gemini-embedding-001), `mistralEmbedding` (mistral-embed, codestral-embed), `ollamaEmbedding` (nomic-embed-text and any local model), `bedrockEmbedding` (Titan Text V2, Titan Multimodal G1 with fused text+image, Cohere Embed v3 on Bedrock), and `@tanstack/ai-cohere`'s `cohereEmbedding` (embed-v4.0, multimodal text+image with required `inputType`).

- [#845](https://github.com/TanStack/ai/pull/845) [`6903978`](https://github.com/TanStack/ai/commit/690397804254dca638961c79b7941555edc52c02) - feat: add `rerank()` activity for reordering documents by relevance to a query

  Adds a provider-agnostic `rerank()` activity (with `createRerankOptions`, the
  `RerankAdapter` interface, and `BaseRerankAdapter`). Documents may be strings
  or JSON-serializable objects — object documents are serialized for the
  provider and the original element is returned in the result, fully typed.
  Supports `topN`, per-request cancellation via `abortSignal`, and the standard
  observe-only `GenerationMiddleware` (`onStart`/`onUsage`/`onFinish`/`onAbort`/
  `onError`) plus `rerank:*` devtools events. Rerank bills in provider-defined
  search units, surfaced on `usage.unitsBilled`.

  The first adapter ships in the new `@tanstack/ai-cohere` package as
  `cohereRerank` / `createCohereRerank`.

### Patch Changes

- Updated dependencies [[`59aa8b5`](https://github.com/TanStack/ai/commit/59aa8b5049549246227c8f2cf736ce50d05205a5), [`ee07854`](https://github.com/TanStack/ai/commit/ee07854fd3d2d4bb279e6e4748802f7f9a5a7167), [`b785cc4`](https://github.com/TanStack/ai/commit/b785cc4ae382fb0e2a337199d192bd9335ac9249), [`47e2464`](https://github.com/TanStack/ai/commit/47e246480d29e2ab5a83ca684e047670e75ba66c), [`dd7ddf1`](https://github.com/TanStack/ai/commit/dd7ddf19283358adfbf61d057321d7daee3ca50d), [`6903978`](https://github.com/TanStack/ai/commit/690397804254dca638961c79b7941555edc52c02), [`fdb791a`](https://github.com/TanStack/ai/commit/fdb791a1c9c8de906eecf76f59743f697621b027), [`7aa4ae9`](https://github.com/TanStack/ai/commit/7aa4ae9d07d21195dd3d62598ac503f1dfdc79e4), [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e)]:
  - @tanstack/ai@0.44.0
