---
'@tanstack/ai': minor
'@tanstack/ai-acp': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-bedrock': minor
'@tanstack/ai-byteplus': minor
'@tanstack/ai-cartesia': minor
'@tanstack/ai-claude-code': minor
'@tanstack/ai-cloudflare': minor
'@tanstack/ai-codex': minor
'@tanstack/ai-cohere': minor
'@tanstack/ai-elevenlabs': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-grok-build': minor
'@tanstack/ai-groq': minor
'@tanstack/ai-llmgateway': minor
'@tanstack/ai-lovable': minor
'@tanstack/ai-meshy': minor
'@tanstack/ai-mistral': minor
'@tanstack/ai-muse': minor
'@tanstack/ai-neon': minor
'@tanstack/ai-ollama': minor
'@tanstack/ai-ollaya': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-opencode': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-reactor': minor
'@tanstack/ai-tripo': minor
'@tanstack/ai-typesafe': minor
'@tanstack/ai-uthana': minor
'@tanstack/ai-vercel-gateway': minor
'@tanstack/ai-vertex': minor
'@tanstack/ai-worldlabs': minor
'@tanstack/openai-base': minor
---

Every adapter takes `defaultModelOptions`, of every kind: text, embedding, image, speech, transcription, audio, voice, video, live video, 3D model, 3D motion, world, rerank, summarize, and evaluate. Each activity (`chat()`, `embed()`, `generateImage()`, `generateSpeech()`, and the others) merges them under the `modelOptions` of each call, one level deep. A key that the call sets replaces the default key in full. The middleware, the devtools events, and the adapter all get the merged value.

```ts
const adapter = openaiImage('gpt-image-2.6-flare', {
  defaultModelOptions: { quality: 'high', output_format: 'webp' },
})
```

`summarize()` with a text-backed summarize adapter applies the `defaultModelOptions` of the wrapped text adapter. A `temperature` in those defaults replaces the built-in summarize temperature.

The OpenAI, Cloudflare, Ollaya, and TypeSafe evaluate adapters now send `modelOptions` in the request. Before, they did not send them.

`ollamaText()`, `ollamaEmbedding()`, `tripo3dModel()`, and the summarize factories of Anthropic, Gemini, Ollama, and Vertex take `defaultModelOptions` too.

`ai-uthana`: the `defaults` config option is deprecated. Use `defaultModelOptions`.
