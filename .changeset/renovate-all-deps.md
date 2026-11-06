---
'@tanstack/ai': patch
'@tanstack/ai-acp': patch
'@tanstack/ai-angular': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-byteplus': patch
'@tanstack/ai-client': patch
'@tanstack/ai-cloudflare': patch
'@tanstack/ai-code-mode': patch
'@tanstack/ai-devtools-core': patch
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai-event-client': patch
'@tanstack/ai-fal': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-harness': patch
'@tanstack/ai-isolate-quickjs': patch
'@tanstack/ai-isolate-quickjs-bun': patch
'@tanstack/ai-llmgateway': patch
'@tanstack/ai-lovable': patch
'@tanstack/ai-mcp': patch
'@tanstack/ai-memory': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-neon': patch
'@tanstack/ai-octane': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-opencode': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-persistence': patch
'@tanstack/ai-remix': patch
'@tanstack/ai-sandbox': patch
'@tanstack/ai-sandbox-blaxel': patch
'@tanstack/ai-sandbox-boxd': patch
'@tanstack/ai-sandbox-daytona': patch
'@tanstack/ai-sandbox-e2b': patch
'@tanstack/ai-sandbox-railway': patch
'@tanstack/ai-sandbox-upstash-box': patch
'@tanstack/ai-skills': patch
'@tanstack/ai-vercel-gateway': patch
'@tanstack/openai-base': patch
'@tanstack/preact-ai-devtools': patch
'@tanstack/react-ai-devtools': patch
'@tanstack/solid-ai-devtools': patch
'@tanstack/svelte-ai-devtools': patch
---

Update dependencies to their latest versions.

- `@tanstack/ai-anthropic` uses `@anthropic-ai/sdk` 1.x. The `@anthropic-ai/vertex-sdk` peer now also accepts 1.x.
- `@tanstack/ai-mistral` uses `@mistralai/mistralai` 3.x and sends `resource` and `resource_link` content chunks.
- `@tanstack/ai-openrouter` uses `@openrouter/sdk` 1.x.
- `@tanstack/ai-acp` uses `@agentclientprotocol/sdk` 2.x.
- `@tanstack/ai-gemini` uses `@google/genai` 2.32.
- Peer ranges now also accept `vitest` 5, `google-auth-library` 11, and `@cloudflare/workers-types` 5.
- `@tanstack/ai-remix` needs stable `remix` 3 (`^3.0.0`) and imports from `remix/component`.
- `@tanstack/ai-devtools-core` depends on `@tanstack/devtools` directly, so its type declarations resolve.
