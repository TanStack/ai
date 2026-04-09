---
'@tanstack/ai-ollama': patch
---

Add `headers` support to `OllamaClientConfig` and `createOllamaChat`. The Ollama SDK already accepts `config.headers` and passes them on every request — this change exposes the option through the TanStack AI adapter, enabling custom headers like `X-Test-Id` for test isolation.
