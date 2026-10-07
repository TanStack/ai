---
'@tanstack/ai-anthropic': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openrouter': patch
---

The Anthropic, Mistral, Ollama, and OpenRouter text adapters now send each model request through the `wrapFetch` of the call. Without `wrapFetch`, the request does not change. An Anthropic or Ollama adapter with an injected client ignores `wrapFetch`, because the adapter cannot reach the fetch of that client.
