# @tanstack/ai-neon

## 0.2.2

### Patch Changes

- [#2055](https://github.com/TanStack/ai/pull/2055) [`af23e5d`](https://github.com/TanStack/ai/commit/af23e5d12042a989ed8a931207f05992b8a81279) - Update model metadata from OpenRouter API

## 0.2.1

### Patch Changes

- [#1973](https://github.com/TanStack/ai/pull/1973) [`374fb69`](https://github.com/TanStack/ai/commit/374fb69a534de7e200421056acf3a677fd833bce) - The adapters now call the provider HTTP API with `fetch` and do not create the `openai` SDK client. At runtime they load only small SDK modules, for example the error classes from `openai/core/error`. With a bundler that splits chunks, the startup bundle is smaller. A single-file bundle can be a little larger, because a few rare options still load the full SDK on first use. Errors keep the same classes and fields.

- [#1895](https://github.com/TanStack/ai/pull/1895) [`e024981`](https://github.com/TanStack/ai/commit/e024981ed2c0481c506595dae1280a94a7fba2e4) - Update model metadata from OpenRouter API

- Updated dependencies [[`1f777da`](https://github.com/TanStack/ai/commit/1f777da51534bde12c9af3efd6c73855836ee7d7), [`48cbc66`](https://github.com/TanStack/ai/commit/48cbc66d677896e75d242e9c52be67f7da259fd9), [`374fb69`](https://github.com/TanStack/ai/commit/374fb69a534de7e200421056acf3a677fd833bce), [`374fb69`](https://github.com/TanStack/ai/commit/374fb69a534de7e200421056acf3a677fd833bce), [`374fb69`](https://github.com/TanStack/ai/commit/374fb69a534de7e200421056acf3a677fd833bce)]:
  - @tanstack/ai-anthropic@1.1.1
  - @tanstack/ai@1.2.0
  - @tanstack/ai-utils@1.1.0
  - @tanstack/openai-base@1.0.2

## 0.2.0

### Minor Changes

- [#1977](https://github.com/TanStack/ai/pull/1977) [`9ac67f3`](https://github.com/TanStack/ai/commit/9ac67f3acbcecee88714503b205d602560fdc8c6) - Forward the new optional embedding `abortSignal` to the embeddings request.

### Patch Changes

- Updated dependencies [[`9ac67f3`](https://github.com/TanStack/ai/commit/9ac67f3acbcecee88714503b205d602560fdc8c6), [`9ac67f3`](https://github.com/TanStack/ai/commit/9ac67f3acbcecee88714503b205d602560fdc8c6), [`9ac67f3`](https://github.com/TanStack/ai/commit/9ac67f3acbcecee88714503b205d602560fdc8c6), [`e17cae7`](https://github.com/TanStack/ai/commit/e17cae7aa40ce5ebe0e78496931d49c793bdaf41), [`d6ead13`](https://github.com/TanStack/ai/commit/d6ead13def85f91782e20d6c1b8755fdf1c836c2), [`450950d`](https://github.com/TanStack/ai/commit/450950da860d58047c654c1497ddb48d651f9076), [`07d2e42`](https://github.com/TanStack/ai/commit/07d2e429c456a31d35748fecf7d8f8c0795eff31), [`13b1ca9`](https://github.com/TanStack/ai/commit/13b1ca918a0ac36761db2a6226973c5330d4221d), [`e17cae7`](https://github.com/TanStack/ai/commit/e17cae7aa40ce5ebe0e78496931d49c793bdaf41), [`940c402`](https://github.com/TanStack/ai/commit/940c402d8ca5220e3202326e03cc1f64654572a3), [`09dde65`](https://github.com/TanStack/ai/commit/09dde65b9fdcc312fd0459c98328c23abd1406cb)]:
  - @tanstack/ai@1.1.0
  - @tanstack/ai-anthropic@1.1.0
  - @tanstack/ai-utils@1.0.1
  - @tanstack/openai-base@1.0.1

## 0.1.0

### Minor Changes

- [#1851](https://github.com/TanStack/ai/pull/1851) [`f7e7cce`](https://github.com/TanStack/ai/commit/f7e7cce8f2d543a7480b626b7985417e054bfd8d) - Add `@tanstack/ai-neon` for the Neon AI Gateway: `neonText` sends Claude to the Anthropic Messages route, codex and `*-pro` models to the Responses route, and every other model to Chat Completions, with `neonEmbedding` and `neonSummarize`. `@tanstack/openai-base` gets a `streamOptions(model)` hook, so a Chat Completions backend that rejects `stream_options` can leave it out.

### Patch Changes

- Updated dependencies [[`fcbd199`](https://github.com/TanStack/ai/commit/fcbd199a66b553acef0b81bc76c4b4acd7fde6a9), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`ec9023e`](https://github.com/TanStack/ai/commit/ec9023e9be665fbd0ffea3e639280c2216edc16c), [`9f1bdd6`](https://github.com/TanStack/ai/commit/9f1bdd61b4df1d16c23a6ce300fa0424ab824d6a), [`959f43e`](https://github.com/TanStack/ai/commit/959f43e4b11112f2c097f642bdec34d8d0f83e27), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`fa2a291`](https://github.com/TanStack/ai/commit/fa2a291f5526f6dec9a91fe5b71de15dfaf59ec7), [`f7e7cce`](https://github.com/TanStack/ai/commit/f7e7cce8f2d543a7480b626b7985417e054bfd8d), [`028f30f`](https://github.com/TanStack/ai/commit/028f30f948181188f00fa33d3ed423b86e47774e), [`7a0a48b`](https://github.com/TanStack/ai/commit/7a0a48bac8b531a90e768c87cb645da2fc8d3f31), [`468063c`](https://github.com/TanStack/ai/commit/468063c07cd904be97b154b415163c23510834b2), [`36eab88`](https://github.com/TanStack/ai/commit/36eab8835f2e7718b2d52a2c0e6e5797830041c7), [`fe83aa0`](https://github.com/TanStack/ai/commit/fe83aa05fe2346c50693664d4a4896d4fc1fea5a), [`85204ea`](https://github.com/TanStack/ai/commit/85204eaf1a02ec4bbebc9f8390233221a81bc21c), [`781a3a8`](https://github.com/TanStack/ai/commit/781a3a82c870e246deff23c7aca32094e9aaaf2f), [`39abb7e`](https://github.com/TanStack/ai/commit/39abb7ed172b4357bc04a39fc6cf7c3577f77cf3), [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e), [`49dbcf9`](https://github.com/TanStack/ai/commit/49dbcf92e80f20b98707d800dcf30e90b2e20d32)]:
  - @tanstack/ai@1.0.0
  - @tanstack/ai-utils@1.0.0
  - @tanstack/ai-anthropic@1.0.0
  - @tanstack/openai-base@1.0.0
