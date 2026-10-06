---
'@tanstack/ai': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-lovable': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-byteplus': minor
'@tanstack/ai-persistence': patch
---

Video adapters can hand a provider's download stream to generation persistence instead of buffering it. Adapters now implement `getVideo()`. When a provider has no public URL for the finished video (OpenRouter, Lovable, Sora jobs without `url`), it returns a `VideoStreamResult` (`{ body, contentType }`), and `withGenerationPersistence` streams it into your blob store and sets `url` from `artifactUrl`.

Nothing changes without persistence: `getVideoJobStatus()` and streaming `generateVideo()` still return a base64 `data:` URL for those providers.

`VideoAdapter.getVideoUrl()` is deprecated in favor of `getVideo()`. It still works: on the built-in adapters it is `getVideo()` with a stream buffered into a `data:` URL, and custom adapters that only implement `getVideoUrl()` keep working. A custom adapter that extends `BaseVideoAdapter` with TypeScript's `noImplicitOverride` must add `override` to its `getVideoUrl()`, or rename it to `getVideo()`.
