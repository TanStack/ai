---
'@tanstack/ai-grok': patch
---

Aborting `generateImage()`, `generateSpeech()`, `generateTranscription()` or `generateVideo()` now stops the xAI request. Before, the call rejected but the request kept running and was billed.
