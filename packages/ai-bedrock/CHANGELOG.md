# @tanstack/ai-bedrock

## 0.2.0

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

- Updated dependencies [[`59aa8b5`](https://github.com/TanStack/ai/commit/59aa8b5049549246227c8f2cf736ce50d05205a5), [`ee07854`](https://github.com/TanStack/ai/commit/ee07854fd3d2d4bb279e6e4748802f7f9a5a7167), [`b785cc4`](https://github.com/TanStack/ai/commit/b785cc4ae382fb0e2a337199d192bd9335ac9249), [`7d92296`](https://github.com/TanStack/ai/commit/7d922963b09b59dd693fcaef84bef3ffe35a0a94), [`47e2464`](https://github.com/TanStack/ai/commit/47e246480d29e2ab5a83ca684e047670e75ba66c), [`dd7ddf1`](https://github.com/TanStack/ai/commit/dd7ddf19283358adfbf61d057321d7daee3ca50d), [`6903978`](https://github.com/TanStack/ai/commit/690397804254dca638961c79b7941555edc52c02), [`fdb791a`](https://github.com/TanStack/ai/commit/fdb791a1c9c8de906eecf76f59743f697621b027), [`7aa4ae9`](https://github.com/TanStack/ai/commit/7aa4ae9d07d21195dd3d62598ac503f1dfdc79e4), [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e)]:
  - @tanstack/ai@0.44.0
  - @tanstack/openai-base@0.9.11

## 0.1.6

### Patch Changes

- Updated dependencies [[`ed44467`](https://github.com/TanStack/ai/commit/ed44467c5e701f0a4fcc1c9f5639d036de35d26a)]:
  - @tanstack/ai@0.43.1
  - @tanstack/openai-base@0.9.10

## 0.1.5

### Patch Changes

- Updated dependencies [[`7499171`](https://github.com/TanStack/ai/commit/74991716aea4d90a5d0363676a1e3349689a48e8)]:
  - @tanstack/ai@0.43.0
  - @tanstack/openai-base@0.9.10

## 0.1.4

### Patch Changes

- Updated dependencies [[`3e1b510`](https://github.com/TanStack/ai/commit/3e1b510e4fdd2334af468c47b7c37b572805200e)]:
  - @tanstack/ai@0.42.0
  - @tanstack/openai-base@0.9.9

## 0.1.3

### Patch Changes

- [#924](https://github.com/TanStack/ai/pull/924) [`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5) - fix: resolve directory-barrel imports in published `.d.ts` files. Bare imports of `utils`/`tools`/`middleware` barrels were emitted as `../utils.js` (etc.), which do not resolve under bundler/node16/nodenext (no `/index` fallback for explicit `.js`). With consumer `skipLibCheck: true` those symbols silently became `any`. Imports now target concrete modules (e.g. `utils/client`, `middleware/types`) or explicit `/index` paths so public types resolve correctly.

- [#922](https://github.com/TanStack/ai/pull/922) [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669) - fix: resolve dangling relative imports in published declaration files

  Switch directory-barrel imports (`../utils`, `../tools`, `../middleware`) to
  concrete module paths so emitted `.d.ts` specifiers resolve under
  `bundler`/`node16`/`nodenext` resolution. Adds a `test:dts` scanner guardrail.

  Fixes [#920](https://github.com/TanStack/ai/issues/920)

- Updated dependencies [[`fbfd4be`](https://github.com/TanStack/ai/commit/fbfd4be3dda591303725664a802e0efbced0d22b), [`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5), [`2665085`](https://github.com/TanStack/ai/commit/2665085970ab4d792778bb2b635ef27fbdcb6be1), [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`de5fbb5`](https://github.com/TanStack/ai/commit/de5fbb52a916826cdc0ef31d18df402cd611b9d4)]:
  - @tanstack/openai-base@0.9.8
  - @tanstack/ai@0.41.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a)]:
  - @tanstack/ai@0.40.0
  - @tanstack/openai-base@0.9.7

## 0.1.1

### Patch Changes

- Updated dependencies [[`afba322`](https://github.com/TanStack/ai/commit/afba32236022589afce4d5a165fd4a8a884ae57d), [`e7ad181`](https://github.com/TanStack/ai/commit/e7ad181cad20c5d6560f480835c99ff1142b40af)]:
  - @tanstack/ai@0.39.1
  - @tanstack/openai-base@0.9.6

## 0.1.0

### Minor Changes

- [#665](https://github.com/TanStack/ai/pull/665) [`27ba4c7`](https://github.com/TanStack/ai/commit/27ba4c72eb959786635046dc9e7d58cad3d6c4cd) - Add `@tanstack/ai-bedrock`: an Amazon Bedrock adapter. The default `bedrockText` path uses Bedrock's **Converse** API (`@aws-sdk/client-bedrock-runtime`), reaching the broad chat catalog including Anthropic Claude, Amazon Nova, and Meta Llama, with streaming, tools, reasoning, and structured output. Opt into Bedrock's OpenAI-compatible endpoints with `api: 'chat'` (Chat Completions) or `api: 'responses'` (gpt-oss Responses). Authentication supports Bedrock API keys or SigV4 via the AWS credential chain.

### Patch Changes

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai@0.39.0
  - @tanstack/openai-base@0.9.6
