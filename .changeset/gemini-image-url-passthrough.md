---
'@tanstack/ai-gemini': patch
---

fix(ai-gemini): stop fetching arbitrary HTTPS image URLs in `createGeminiImage`. URL sources in multimodal image-generation prompts now pass through as `fileData.fileUri` (Gemini fetches them server-side), matching the chat adapter. This avoids fetch + base64 double-buffering that could OOM on memory-constrained runtimes such as Cloudflare Workers.
