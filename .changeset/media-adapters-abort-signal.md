---
'@tanstack/ai-openai': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-grok': patch
---

Cancelling `generateSpeech()`, `generateTranscription()` or `generateImage()` with `abortSignal` (or `timeout`) now cancels the in-flight provider request for the OpenAI, Groq and Grok adapters. They accepted the signal but never passed it to the SDK or `fetch`, so the request ran to completion and was billed.
