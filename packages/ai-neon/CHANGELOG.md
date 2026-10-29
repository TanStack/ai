# @tanstack/ai-neon

## 0.1.0

### Minor Changes

- [#1851](https://github.com/TanStack/ai/pull/1851) [`f7e7cce`](https://github.com/TanStack/ai/commit/f7e7cce8f2d543a7480b626b7985417e054bfd8d) - Add `@tanstack/ai-neon` for the Neon AI Gateway: `neonText` sends Claude to the Anthropic Messages route, codex and `*-pro` models to the Responses route, and every other model to Chat Completions, with `neonEmbedding` and `neonSummarize`. `@tanstack/openai-base` gets a `streamOptions(model)` hook, so a Chat Completions backend that rejects `stream_options` can leave it out.

### Patch Changes

- Updated dependencies [[`fcbd199`](https://github.com/TanStack/ai/commit/fcbd199a66b553acef0b81bc76c4b4acd7fde6a9), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`ec9023e`](https://github.com/TanStack/ai/commit/ec9023e9be665fbd0ffea3e639280c2216edc16c), [`9f1bdd6`](https://github.com/TanStack/ai/commit/9f1bdd61b4df1d16c23a6ce300fa0424ab824d6a), [`959f43e`](https://github.com/TanStack/ai/commit/959f43e4b11112f2c097f642bdec34d8d0f83e27), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`fa2a291`](https://github.com/TanStack/ai/commit/fa2a291f5526f6dec9a91fe5b71de15dfaf59ec7), [`f7e7cce`](https://github.com/TanStack/ai/commit/f7e7cce8f2d543a7480b626b7985417e054bfd8d), [`028f30f`](https://github.com/TanStack/ai/commit/028f30f948181188f00fa33d3ed423b86e47774e), [`7a0a48b`](https://github.com/TanStack/ai/commit/7a0a48bac8b531a90e768c87cb645da2fc8d3f31), [`468063c`](https://github.com/TanStack/ai/commit/468063c07cd904be97b154b415163c23510834b2), [`36eab88`](https://github.com/TanStack/ai/commit/36eab8835f2e7718b2d52a2c0e6e5797830041c7), [`fe83aa0`](https://github.com/TanStack/ai/commit/fe83aa05fe2346c50693664d4a4896d4fc1fea5a), [`85204ea`](https://github.com/TanStack/ai/commit/85204eaf1a02ec4bbebc9f8390233221a81bc21c), [`781a3a8`](https://github.com/TanStack/ai/commit/781a3a82c870e246deff23c7aca32094e9aaaf2f), [`39abb7e`](https://github.com/TanStack/ai/commit/39abb7ed172b4357bc04a39fc6cf7c3577f77cf3), [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e), [`49dbcf9`](https://github.com/TanStack/ai/commit/49dbcf92e80f20b98707d800dcf30e90b2e20d32)]:
  - @tanstack/ai@1.0.0
  - @tanstack/ai-utils@1.0.0
  - @tanstack/ai-anthropic@1.0.0
  - @tanstack/openai-base@1.0.0
