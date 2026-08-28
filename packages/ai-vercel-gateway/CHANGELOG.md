# @tanstack/ai-vercel-gateway

## 0.2.4

### Patch Changes

- Updated dependencies [[`43b51f2`](https://github.com/TanStack/ai/commit/43b51f2e89db1c9fb23bb34b4ea4e052d370fb31), [`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/openai-base@0.10.7
  - @tanstack/ai@0.51.0

## 0.2.3

### Patch Changes

- [#1253](https://github.com/TanStack/ai/pull/1253) [`8147e66`](https://github.com/TanStack/ai/commit/8147e6680996fc6f6c2d73294135ee0ccd5d1697) - Stop requiring Zod as a peer dependency when the adapters do not import it at runtime.

- Updated dependencies [[`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b), [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b)]:
  - @tanstack/ai@0.50.0
  - @tanstack/openai-base@0.10.6

## 0.2.2

### Patch Changes

- [#1238](https://github.com/TanStack/ai/pull/1238) [`10dfc8b`](https://github.com/TanStack/ai/commit/10dfc8bd71d8cd2a8f478d33036a17bd6a5fcd7f) - Update model metadata from OpenRouter API

## 0.2.1

### Patch Changes

- [#1194](https://github.com/TanStack/ai/pull/1194) [`d3aa104`](https://github.com/TanStack/ai/commit/d3aa104932442bfb0e0268af1c8240a00fe51aa9) - Update model metadata from OpenRouter API

- Updated dependencies [[`67ce4e5`](https://github.com/TanStack/ai/commit/67ce4e529c42e64d4591f996c7e3e32458d5dd7c), [`59481e2`](https://github.com/TanStack/ai/commit/59481e297831ba4bc7c13a80b3d23d1f6fbb7231)]:
  - @tanstack/ai@0.49.1
  - @tanstack/openai-base@0.10.5

## 0.2.0

### Minor Changes

- [#906](https://github.com/TanStack/ai/pull/906) [`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd) - Add headless BYOK: `defineByok` in `@tanstack/ai-client/byok`, pass `byok` into chat and generation hooks, and read keys on the relay with `getByokKey` from `@tanstack/ai/byok/server`. Provider ids are open slugs (`x-byok-<slug>`). Each adapter exports a `{ id, label, env? }` object (`openaiByok`, …); `id` is required. `env` is the env var name(s) for the relay — names only; the client never reads `process.env`. A wrong key surfaces as the provider's own `401` through the relay, so no client-side key check is needed. OpenRouter PKCE (`@tanstack/ai-openrouter/pkce`) saves the minted key under `openrouterByok.id`.

### Patch Changes

- Updated dependencies [[`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd)]:
  - @tanstack/ai@0.49.0
  - @tanstack/openai-base@0.10.4

## 0.1.7

### Patch Changes

- Updated dependencies [[`1c0415b`](https://github.com/TanStack/ai/commit/1c0415bec4bbefcd3abf784d0209af05aca5db46)]:
  - @tanstack/ai@0.48.0
  - @tanstack/openai-base@0.10.3

## 0.1.6

### Patch Changes

- [#1179](https://github.com/TanStack/ai/pull/1179) [`2fd333a`](https://github.com/TanStack/ai/commit/2fd333a134e4cbe79ba38dcc1b999e829be6b998) - Update model metadata from OpenRouter API

- Updated dependencies [[`7c4b73a`](https://github.com/TanStack/ai/commit/7c4b73af5023e7ab7e113121644213c75d611aac), [`87e497f`](https://github.com/TanStack/ai/commit/87e497f2e282c2389579051ec743fa4cc8cf493e), [`ff27fde`](https://github.com/TanStack/ai/commit/ff27fdeb2e134cb4c2b69e6809774477ffdc26a0), [`c0ba484`](https://github.com/TanStack/ai/commit/c0ba48402a807d6482e1cb36a0cf393d0cd26b2b), [`d34b6c0`](https://github.com/TanStack/ai/commit/d34b6c01fbc9ed83e5dc9bd2725eb05f6b03bfd4), [`66ba92c`](https://github.com/TanStack/ai/commit/66ba92cb5c2cfaf07ee2269306048e2fd4f788fe)]:
  - @tanstack/ai@0.47.3
  - @tanstack/openai-base@0.10.2

## 0.1.5

### Patch Changes

- Updated dependencies [[`11c988b`](https://github.com/TanStack/ai/commit/11c988b8ea2153e0ee0f86ba58083f42c343fd75), [`47699ed`](https://github.com/TanStack/ai/commit/47699ed1bf0c21a3835f012fe95f9dd8f089e41d)]:
  - @tanstack/openai-base@0.10.0
  - @tanstack/ai@0.47.1

## 0.1.4

### Patch Changes

- [#1158](https://github.com/TanStack/ai/pull/1158) [`583ad22`](https://github.com/TanStack/ai/commit/583ad2235ab4a4c7a9d5cdcc3d94e0463366b42f) - Update model metadata from OpenRouter API

- Updated dependencies [[`5f68cbc`](https://github.com/TanStack/ai/commit/5f68cbccf3621b48dae73cedcb1e59cb4cbe72b4), [`32e62ab`](https://github.com/TanStack/ai/commit/32e62ab8b7dc6a8a13ca3851c8925ab806e08f29)]:
  - @tanstack/ai@0.47.0
  - @tanstack/openai-base@0.9.16

## 0.1.3

### Patch Changes

- Updated dependencies [[`41a5d18`](https://github.com/TanStack/ai/commit/41a5d189082331e052e1f2f5e987848501ffd08b), [`4599019`](https://github.com/TanStack/ai/commit/4599019eb02f72562ef155b69b8f61f9d25d187a), [`3eda66c`](https://github.com/TanStack/ai/commit/3eda66cb132def6346829ba113f315ffdd4edf6b), [`ecd12a4`](https://github.com/TanStack/ai/commit/ecd12a408987bc75649c21aada6948282a2a66dd)]:
  - @tanstack/ai@0.46.0
  - @tanstack/openai-base@0.9.15

## 0.1.2

### Patch Changes

- [#1150](https://github.com/TanStack/ai/pull/1150) [`b6d7f52`](https://github.com/TanStack/ai/commit/b6d7f5217c04a42d7e23161b8a89f961f6f04ab7) - Update model metadata from OpenRouter API

## 0.1.1

### Patch Changes

- [#1048](https://github.com/TanStack/ai/pull/1048) [`bc8c5e8`](https://github.com/TanStack/ai/commit/bc8c5e8684da159b08e63aba7cfc51b01289d4eb) - Update model metadata from OpenRouter API

- Updated dependencies [[`d10dfe6`](https://github.com/TanStack/ai/commit/d10dfe6eca788ae52631d45e5599aa0c45e9ba37), [`eda82cc`](https://github.com/TanStack/ai/commit/eda82cc8a86923afd604a663d050c6edfa6b829b), [`c63319e`](https://github.com/TanStack/ai/commit/c63319e34a2ca2f1d56b90addf28784f7c3e13ad), [`b09e010`](https://github.com/TanStack/ai/commit/b09e010b32932c812e65b1e14f6faa2b0e6d5cb8), [`0fb8263`](https://github.com/TanStack/ai/commit/0fb826321c9ba7bd5d8ba0062be2a00b6178726d)]:
  - @tanstack/ai@0.45.0
  - @tanstack/openai-base@0.9.13

## 0.1.0

### Minor Changes

- [#1093](https://github.com/TanStack/ai/pull/1093) [`45b67d7`](https://github.com/TanStack/ai/commit/45b67d720831c10284b7acaf3c7e3f5af307a7ae) - Add `@tanstack/ai-vercel-gateway` for Vercel AI Gateway chat, embeddings, and image generation.
