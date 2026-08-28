# @tanstack/ai-lovable

## 0.2.2

### Patch Changes

- Updated dependencies [[`43b51f2`](https://github.com/TanStack/ai/commit/43b51f2e89db1c9fb23bb34b4ea4e052d370fb31), [`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/openai-base@0.10.7
  - @tanstack/ai@0.51.0

## 0.2.1

### Patch Changes

- [#1253](https://github.com/TanStack/ai/pull/1253) [`8147e66`](https://github.com/TanStack/ai/commit/8147e6680996fc6f6c2d73294135ee0ccd5d1697) - Stop requiring Zod as a peer dependency when the adapters do not import it at runtime.

- Updated dependencies [[`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b), [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b)]:
  - @tanstack/ai@0.50.0
  - @tanstack/openai-base@0.10.6

## 0.2.0

### Minor Changes

- [#1240](https://github.com/TanStack/ai/pull/1240) [`d0843c6`](https://github.com/TanStack/ai/commit/d0843c6b4d388e7f26036230f6ecbff112090e96) - `LovableModelId` is now the curated `LovableChatModel` union. The `(string & {})` escape hatch is removed, so TypeScript rejects uncurated model ids in `lovableText`, `createLovableText`, `lovableResponsesText`, `createLovableResponsesText`, and the summarize factories. The other modalities (image, video, embedding, TTS, transcription) were already limited to their curated lists.

## 0.1.0

### Minor Changes

- [#1226](https://github.com/TanStack/ai/pull/1226) [`af5fc73`](https://github.com/TanStack/ai/commit/af5fc73aeacc1d6b9b892e4be703784d50567a83) - Add a Lovable AI Gateway adapter for chat, embeddings, image, video, speech, transcription, and BYOK

### Patch Changes

- Updated dependencies [[`67ce4e5`](https://github.com/TanStack/ai/commit/67ce4e529c42e64d4591f996c7e3e32458d5dd7c), [`59481e2`](https://github.com/TanStack/ai/commit/59481e297831ba4bc7c13a80b3d23d1f6fbb7231)]:
  - @tanstack/ai@0.49.1
  - @tanstack/openai-base@0.10.5
