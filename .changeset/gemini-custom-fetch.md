---
'@tanstack/ai-gemini': patch
---

Send Gemini API requests through `httpOptions.fetch` again when the client has an `apiKey`. Since 1.1.1 the adapters called the global `fetch` and ignored a custom one, also for image generation through the Interactions API. The `httpOptions.fetch` type is in `@google/genai` 2.23.0 and later.
