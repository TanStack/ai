---
'@tanstack/ai': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-lovable': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-persistence': patch
---

Video adapters can hand a provider's download stream to generation persistence instead of buffering it. When a provider has no public URL for the finished video (OpenRouter, Lovable, Sora jobs without `url`), the adapter's new optional `getVideo()` returns a `VideoStreamResult` (`{ body, contentType }`), and `withGenerationPersistence` streams it into your blob store and sets `url` from `artifactUrl`.

Nothing changes without persistence: `getVideoJobStatus()`, streaming `generateVideo()` and `adapter.getVideoUrl()` still return a base64 `data:` URL for those providers. Custom video adapters keep implementing `getVideoUrl()`; implement `getVideo()` as well to return a stream.
