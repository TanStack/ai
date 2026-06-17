# @tanstack/ai-angular

## 0.1.3

### Patch Changes

- Updated dependencies [[`07aaf8b`](https://github.com/TanStack/ai/commit/07aaf8b9e5a8e699be25f936cc9cd651a46c16c5)]:
  - @tanstack/ai@0.31.0
  - @tanstack/ai-client@0.17.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`4d5141c`](https://github.com/TanStack/ai/commit/4d5141c128c0e9bd33cdbf36a5402811cefc3f8b)]:
  - @tanstack/ai-client@0.17.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`7103348`](https://github.com/TanStack/ai/commit/71033488212bff05dcccc857e721ab9262ebc2a6), [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai@0.30.0
  - @tanstack/ai-client@0.17.1

## 0.1.0

### Minor Changes

- [#762](https://github.com/TanStack/ai/pull/762) [`24028c5`](https://github.com/TanStack/ai/commit/24028c59d7c2c2d19c5685865fa6bc6d466ca16b) - Add `@tanstack/ai-angular`: an Angular signals adapter for TanStack AI, at feature parity with `@tanstack/ai-vue`. Exposes `injectChat` (streaming chat with tools, structured outputs, and fully reactive `body`/`forwardedProps`/`context`/`live` options that accept a value, `Signal`, or getter) plus media-generation functions `injectGeneration`, `injectGenerateImage`, `injectGenerateAudio`, `injectGenerateSpeech`, `injectGenerateVideo`, `injectTranscription`, and `injectSummarize`. All functions are called in an Angular injection context and return Angular signals.
