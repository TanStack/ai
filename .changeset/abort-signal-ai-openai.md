---
'@tanstack/ai-openai': patch
---

Aborting `generateImage()`, `generateSpeech()`, `generateTranscription()` or `generateVideo()` now stops the OpenAI request. Before, the call rejected but the request kept running and was billed. This also covers the image fetch for an `allowUrlFetch` image input.
