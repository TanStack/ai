---
'@tanstack/ai-gemini': minor
'@tanstack/ai-cohere': minor
'@tanstack/ai-elevenlabs': minor
'@tanstack/ai-mistral': minor
'@tanstack/ai-ollama': minor
'@tanstack/ai-bedrock': patch
---

Accept `baseURL` and `defaultHeaders` on every adapter's client config so one gateway config (Cloudflare AI Gateway, Vercel AI Gateway, a corporate proxy) can be spread into any adapter. The vendor-specific names (`httpOptions`, `serverURL`, `host`, `baseUrl`, `headers`) keep working. Bedrock's Converse adapter now applies `defaultHeaders` too.
