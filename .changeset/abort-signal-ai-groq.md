---
'@tanstack/ai-groq': patch
---

Aborting `generateSpeech()` or `generateTranscription()` now stops the Groq request. Before, the call rejected but the request kept running and was billed.
