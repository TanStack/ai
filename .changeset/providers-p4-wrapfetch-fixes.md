---
'@tanstack/openai-base': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-cloudflare': patch
'@tanstack/ai-grok': patch
---

A `wrapFetch` call now wraps the fetch that the adapter gave its OpenAI client. The adapter no longer reads a private field of the OpenAI SDK. The Azure OpenAI adapter makes its per-call client in a protected method, so the client keeps `apiVersion`. The requests do not change.
