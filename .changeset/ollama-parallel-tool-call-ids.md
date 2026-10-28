---
'@tanstack/ai-ollama': patch
---

Keep parallel calls to the same tool apart when Ollama sends no tool-call id. The fallback id was `<name>_<Date.now()>`, so two calls to one tool in the same millisecond shared an id and the second call was dropped. The fallback id now also carries the call's index.
