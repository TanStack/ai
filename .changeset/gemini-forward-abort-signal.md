---
'@tanstack/ai-gemini': patch
---

Forward the caller's abort signal to the Google SDK request (`config.abortSignal`) so aborting a Gemini chat actually cancels the in-flight HTTP request, matching the OpenAI-compatible adapters.
