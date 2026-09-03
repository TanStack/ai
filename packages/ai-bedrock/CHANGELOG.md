# @tanstack/ai-bedrock

## 0.3.7

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871)]:
  - @tanstack/ai@0.53.0
  - @tanstack/openai-base@0.10.10

## 0.3.6

### Patch Changes

- [#1312](https://github.com/TanStack/ai/pull/1312) [`5305d32`](https://github.com/TanStack/ai/commit/5305d320aae400b07bfe3a440d2d720cece44197) - Accept `baseURL` and `defaultHeaders` on every adapter's client config so one gateway config (Cloudflare AI Gateway, Vercel AI Gateway, a corporate proxy) can be spread into any adapter. The vendor-specific names (`httpOptions`, `serverURL`, `host`, `baseUrl`, `headers`) keep working. Bedrock's Converse adapter now applies `defaultHeaders` too.

- Updated dependencies [[`819e77c`](https://github.com/TanStack/ai/commit/819e77cee018106bdcd44870cea2c4f9b6d3004a)]:
  - @tanstack/ai@0.52.3
  - @tanstack/openai-base@0.10.9

## 0.3.5

### Patch Changes

- [#1300](https://github.com/TanStack/ai/pull/1300) [`d98a598`](https://github.com/TanStack/ai/commit/d98a598cf346f0fff9d4aa70c697c8153245743c) - Forward Bedrock Converse cache token counts to `TokenUsage`.

  `cacheReadInputTokens` and `cacheWriteInputTokens` from the Converse `metadata.usage` event now land on `promptTokensDetails.cachedTokens` and `promptTokensDetails.cacheWriteTokens`, in `chatStream`, `structuredOutput`, and `structuredOutputStream`. Bedrock's `inputTokens` counts only the uncached part of the input, so without these fields a cached request looked like a near-zero-input call. Both fields are omitted when Bedrock omits them.

- Updated dependencies [[`452d6a4`](https://github.com/TanStack/ai/commit/452d6a405d669d00f2cc82d5725c53dfad8602cc)]:
  - @tanstack/ai@0.52.2
  - @tanstack/openai-base@0.10.8

## 0.3.4

### Patch Changes

- [#1278](https://github.com/TanStack/ai/pull/1278) [`c3d4376`](https://github.com/TanStack/ai/commit/c3d4376b96548c0224c003b7dd24a665f4c247be) - fix: forward usage from Converse structuredOutputStream()

  `ConverseTextAdapter.structuredOutputStream()` iterated the Converse event stream without a `metadata` branch, so the trailing usage event was ignored and `RUN_FINISHED` carried no token counts on the streaming structured-output path. The normal chat path (`processConverseStream`) and the non-stream `structuredOutput()` already handled it; this brings the third path in line.

- Updated dependencies [[`cfb8454`](https://github.com/TanStack/ai/commit/cfb845469875e1b74def21b9525ee19d68a4abbd)]:
  - @tanstack/ai@0.52.1
  - @tanstack/openai-base@0.10.8

## 0.3.3

### Patch Changes

- Updated dependencies [[`49fc54c`](https://github.com/TanStack/ai/commit/49fc54ca0aacf2fc60bb36647a61a23559dda4bc), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7)]:
  - @tanstack/ai@0.52.0
  - @tanstack/openai-base@0.10.8

## 0.3.2

### Patch Changes

- Updated dependencies [[`43b51f2`](https://github.com/TanStack/ai/commit/43b51f2e89db1c9fb23bb34b4ea4e052d370fb31), [`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/openai-base@0.10.7
  - @tanstack/ai@0.51.0

## 0.3.1

### Patch Changes

- [#1253](https://github.com/TanStack/ai/pull/1253) [`8147e66`](https://github.com/TanStack/ai/commit/8147e6680996fc6f6c2d73294135ee0ccd5d1697) - Stop requiring Zod as a peer dependency when the adapters do not import it at runtime.

- Updated dependencies [[`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b), [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b)]:
  - @tanstack/ai@0.50.0
  - @tanstack/openai-base@0.10.6

## 0.3.0

### Minor Changes

- [#906](https://github.com/TanStack/ai/pull/906) [`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd) - Add headless BYOK: `defineByok` in `@tanstack/ai-client/byok`, pass `byok` into chat and generation hooks, and read keys on the relay with `getByokKey` from `@tanstack/ai/byok/server`. Provider ids are open slugs (`x-byok-<slug>`). Each adapter exports a `{ id, label, env? }` object (`openaiByok`, …); `id` is required. `env` is the env var name(s) for the relay — names only; the client never reads `process.env`. A wrong key surfaces as the provider's own `401` through the relay, so no client-side key check is needed. OpenRouter PKCE (`@tanstack/ai-openrouter/pkce`) saves the minted key under `openrouterByok.id`.

### Patch Changes

- Updated dependencies [[`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd)]:
  - @tanstack/ai@0.49.0
  - @tanstack/openai-base@0.10.4

## 0.2.6

### Patch Changes

- Updated dependencies [[`1c0415b`](https://github.com/TanStack/ai/commit/1c0415bec4bbefcd3abf784d0209af05aca5db46)]:
  - @tanstack/ai@0.48.0
  - @tanstack/openai-base@0.10.3

## 0.2.5

### Patch Changes

- Updated dependencies [[`11c988b`](https://github.com/TanStack/ai/commit/11c988b8ea2153e0ee0f86ba58083f42c343fd75), [`47699ed`](https://github.com/TanStack/ai/commit/47699ed1bf0c21a3835f012fe95f9dd8f089e41d)]:
  - @tanstack/openai-base@0.10.0
  - @tanstack/ai@0.47.1

## 0.2.4

### Patch Changes

- Updated dependencies [[`5f68cbc`](https://github.com/TanStack/ai/commit/5f68cbccf3621b48dae73cedcb1e59cb4cbe72b4), [`32e62ab`](https://github.com/TanStack/ai/commit/32e62ab8b7dc6a8a13ca3851c8925ab806e08f29)]:
  - @tanstack/ai@0.47.0
  - @tanstack/openai-base@0.9.16

## 0.2.3

### Patch Changes

- Updated dependencies [[`41a5d18`](https://github.com/TanStack/ai/commit/41a5d189082331e052e1f2f5e987848501ffd08b), [`4599019`](https://github.com/TanStack/ai/commit/4599019eb02f72562ef155b69b8f61f9d25d187a), [`3eda66c`](https://github.com/TanStack/ai/commit/3eda66cb132def6346829ba113f315ffdd4edf6b), [`ecd12a4`](https://github.com/TanStack/ai/commit/ecd12a408987bc75649c21aada6948282a2a66dd)]:
  - @tanstack/ai@0.46.0
  - @tanstack/openai-base@0.9.15

## 0.2.2

### Patch Changes

- [#1132](https://github.com/TanStack/ai/pull/1132) [`eda82cc`](https://github.com/TanStack/ai/commit/eda82cc8a86923afd604a663d050c6edfa6b829b) - Timestamp native and fallback structured-output events when they are emitted so their lifecycle remains chronologically ordered.

- Updated dependencies [[`d10dfe6`](https://github.com/TanStack/ai/commit/d10dfe6eca788ae52631d45e5599aa0c45e9ba37), [`eda82cc`](https://github.com/TanStack/ai/commit/eda82cc8a86923afd604a663d050c6edfa6b829b), [`c63319e`](https://github.com/TanStack/ai/commit/c63319e34a2ca2f1d56b90addf28784f7c3e13ad), [`b09e010`](https://github.com/TanStack/ai/commit/b09e010b32932c812e65b1e14f6faa2b0e6d5cb8), [`0fb8263`](https://github.com/TanStack/ai/commit/0fb826321c9ba7bd5d8ba0062be2a00b6178726d)]:
  - @tanstack/ai@0.45.0
  - @tanstack/openai-base@0.9.13

## 0.2.1

### Patch Changes

- [#1077](https://github.com/TanStack/ai/pull/1077) [`022d406`](https://github.com/TanStack/ai/commit/022d406fec4e9c3d61b47d50cb02f8872d9076b1) - fix: populate StructuredOutputResult.usage from non-stream structuredOutput()

  Adapters that already returned tokens/cost on streaming structured paths were dropping response.usage on the non-stream structuredOutput() method. OpenRouter now forwards tokens and cost; openai-base, Mistral, and Bedrock Converse do the same for tokens so fallbackStructuredOutputStream and middleware can observe usage.

- Updated dependencies [[`022d406`](https://github.com/TanStack/ai/commit/022d406fec4e9c3d61b47d50cb02f8872d9076b1)]:
  - @tanstack/openai-base@0.9.12

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
