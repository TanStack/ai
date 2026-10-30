---
'@tanstack/ai-ollama': patch
---

Keep parallel calls to the same tool apart when Ollama sends no tool-call id. The fallback id was `<name>_<Date.now()>`, so two calls to one tool in the same millisecond shared an id and the second call was merged into the first instead of running. The fallback id is now unique per call.
