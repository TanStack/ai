# @tanstack/ai-lovable

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
