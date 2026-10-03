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

Video adapters no longer buffer downloaded videos into base64 `data:` URLs. When a provider has no public URL for the finished video (OpenRouter, Lovable, Sora jobs without `url`), the adapter returns a `VideoStreamResult` (`{ body, contentType }`), and `withGenerationPersistence` streams it into your blob store and sets `url` from `artifactUrl`. Without persistence, `getVideoJobStatus()` returns `status: 'failed'` and streaming generation emits `RUN_ERROR`, both naming `withGenerationPersistence`.

Breaking for custom video adapters: `VideoAdapter.getVideoUrl()` is renamed to `getVideo()` and returns `VideoUrlResult | VideoStreamResult`. Rename the method; adapters that return `{ jobId, url }` need no other change. Direct callers must handle the `body` variant. `generateVideo()` and `getVideoJobStatus()` are unchanged.
