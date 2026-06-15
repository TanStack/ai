---
'@tanstack/ai-angular': minor
---

Add `@tanstack/ai-angular`: an Angular signals adapter for TanStack AI, at feature parity with `@tanstack/ai-vue`. Exposes `injectChat` (streaming chat with tools, structured outputs, and fully reactive `body`/`forwardedProps`/`context`/`live` options that accept a value, `Signal`, or getter) plus media-generation functions `injectGeneration`, `injectGenerateImage`, `injectGenerateAudio`, `injectGenerateSpeech`, `injectGenerateVideo`, `injectTranscription`, and `injectSummarize`. All functions are called in an Angular injection context and return Angular signals.
