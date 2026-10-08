---
'@tanstack/ai-cloudflare': minor
---

Add `cloudflareBindingFetch({ binding, vendor, gateway })`. It sends the requests of the Anthropic and OpenAI text adapters (`createAnthropicChat`, `createOpenaiChat`) through the Workers AI binding (`env.AI.run`) to the AI Gateway `anthropic/...` and `openai/...` models, so a Worker can use Claude and GPT with no provider key.

- `vendor: 'anthropic'` carries Anthropic Messages requests, and `vendor: 'openai'` carries OpenAI Responses requests.
- The request body goes to `env.AI.run('<vendor>/<model>', body)`. Headers such as `anthropic-beta` go along as `extraHeaders`, and the SDK's auth and transport headers are dropped.
- A Cloudflare error body is rewrapped so the SDK reports its message.
