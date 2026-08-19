# @tanstack/ai-cohere

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
