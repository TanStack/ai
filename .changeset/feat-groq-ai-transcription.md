---
'@tanstack/ai-groq': minor
---

Adds Groq as a transcription provider. Groq's API is mostly OpenAI SDK-compatible,
but its transcription endpoint additionally accepts HTTP URLs as input, so this
is implemented as a custom integration rather than going through the SDK.
