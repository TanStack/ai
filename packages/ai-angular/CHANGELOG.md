# @tanstack/ai-angular

## 0.1.0

### Minor Changes

- [#762](https://github.com/TanStack/ai/pull/762) [`24028c5`](https://github.com/TanStack/ai/commit/24028c59d7c2c2d19c5685865fa6bc6d466ca16b) - Add `@tanstack/ai-angular`: an Angular signals adapter for TanStack AI, at feature parity with `@tanstack/ai-vue`. Exposes `injectChat` (streaming chat with tools, structured outputs, and fully reactive `body`/`forwardedProps`/`context`/`live` options that accept a value, `Signal`, or getter) plus media-generation functions `injectGeneration`, `injectGenerateImage`, `injectGenerateAudio`, `injectGenerateSpeech`, `injectGenerateVideo`, `injectTranscription`, and `injectSummarize`. All functions are called in an Angular injection context and return Angular signals.
