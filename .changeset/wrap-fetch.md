---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-cloudflare': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openrouter': patch
---

Add `wrapFetch` to `chat()`, to the middleware `onConfig` config, and to `TextOptions`. A wrapper gets the next fetch and gives back a new fetch. Use it to change the URL, the headers, the request, or the response of a model call. The new `FetchWrapper` type names the wrapper.

The engine chains the `chat()` wrapper and the middleware wrappers into one function. A middleware wrapper runs inside the `chat()` wrapper and applies to one model call only.

These text adapters send their requests through the wrapper: every adapter on `@tanstack/openai-base` (OpenAI, the OpenAI-compatible adapters, Grok, Groq, BytePlus, LLM Gateway, Lovable, Vercel AI Gateway, Cloudflare, and the Bedrock Chat Completions and Responses APIs), Anthropic, Mistral, Ollama, and OpenRouter. The wrapper wraps the fetch of the adapter config, not the global fetch. An Anthropic or Ollama adapter with an injected client ignores `wrapFetch`. In Cloudflare binding mode, the wrapper runs, but the binding does not send the URL or the headers. Without `wrapFetch`, the requests do not change.
