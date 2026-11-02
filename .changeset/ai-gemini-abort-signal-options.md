---
'@tanstack/ai-gemini': minor
---

Forward the new optional `abortSignal` in embeddings, Veo and Omni video status and download, files `get` and `delete`, and the realtime token request. `uploadGeminiFile()` takes `abortSignal`: it cancels the status requests and the wait between polls.
