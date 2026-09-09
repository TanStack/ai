---
name: tanstack-ai-providers
description: >
  Choose an LLM provider and model for a TypeScript app, and the TanStack AI
  adapter that wraps it: OpenAI, Anthropic, Gemini, Grok, Groq, Mistral, Cohere,
  Ollama, Bedrock, Vertex, Cloudflare, fal, ElevenLabs, BytePlus, Perplexity,
  Reactor, and the gateways (OpenRouter, Vercel AI Gateway, LLM Gateway,
  Lovable). Use when someone asks which provider or model to use, how to call
  OpenAI or Claude or Gemini from TypeScript, which package an API key belongs
  to, which model id to pass, or which provider does images, video, speech,
  transcription, realtime voice, embeddings, or reranking. Triggers on "which
  provider", "which model", "OpenAI vs Anthropic", "gateway", "model id", "API
  key", "image generation", "text to speech", "embeddings", "rerank",
  "openaiText".
---

# TanStack AI provider adapters

Adapters are tree-shakeable. Each provider package exports one adapter per
capability, and you import only the ones you use.

```ts
import { openaiText } from '@tanstack/ai-openai'
```

Adapter names follow the provider: `anthropicText()`, `geminiImage()`,
`openaiEmbed()`. Read the package's `src/adapters` before you write the import,
because not every provider exports every capability.

## 1. Pick the package

The Adapters docs have one page per provider, with the capabilities each one
supports: https://tanstack.com/ai/latest/docs/adapters/openai.

Use a gateway when the app wants many providers behind one key:
`@tanstack/ai-openrouter`, `@tanstack/ai-vercel-gateway`,
`@tanstack/ai-llmgateway`, or `@tanstack/ai-lovable`. Use `@tanstack/ai-bedrock`
or `@tanstack/ai-vertex` when the models must run inside AWS or Google Cloud.

## 2. Pick the model id from the package, never from memory

Model ids are released and retired constantly, and a wrong id fails at runtime.
Most adapter packages ship their model metadata in `src/model-meta.ts`, which is
published with the package:

```bash
grep -o "'[a-z0-9.-]*'" node_modules/@tanstack/ai-openai/src/model-meta.ts | head -50
```

Take the newest id that has the capability the task needs. Model metadata also
drives the type-safe provider options, so the ids in that file are the ids the
types accept. When a package has no `model-meta.ts`, such as a gateway that
resolves models at runtime, read its `src/` and the adapter docs instead.

## 3. Check the capability, not the brand

Modality support differs per provider and per model:

- Text, tools, structured outputs: every chat adapter.
- Images and video: `@tanstack/ai-openai`, `-gemini`, `-fal`, `-byteplus`,
  `-grok`, `-reactor`, and gateways that proxy them.
- Speech, transcription, realtime voice: `@tanstack/ai-openai`,
  `-elevenlabs`, `-gemini`, `-byteplus`.
- Embeddings: `@tanstack/ai-openai`, `-cohere`, `-gemini`, `-cloudflare`, and
  gateways.
- Reranking: `@tanstack/ai-cohere`.

Confirm against `src/model-meta.ts` in the package and the adapter docs at
https://tanstack.com/ai/latest/docs before you promise a capability.

## 4. Wire the key

Adapters read the provider's standard environment variable, and accept an
explicit key in their options. Read the adapter source or the docs for the exact
variable name. Never invent one, and never put a key in client code.

## After choosing

Go back to `@tanstack/ai`'s own skill for the call itself:

```bash
npx @tanstack/intent@latest load @tanstack/ai#ai-core
```
