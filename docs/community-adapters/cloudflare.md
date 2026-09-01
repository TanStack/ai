---
title: Cloudflare
id: cloudflare-adapter
order: 3
description: "Use Cloudflare Workers AI and AI Gateway with TanStack AI for edge inference, caching, rate limiting, and unified billing across providers."
keywords:
  - tanstack ai
  - cloudflare
  - workers ai
  - ai gateway
  - edge inference
  - caching
  - rate limiting
  - community adapter
---

The Cloudflare adapter provides access to [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) models and [AI Gateway](https://developers.cloudflare.com/ai-gateway/) for routing requests to OpenAI, Anthropic, Gemini, Grok, and OpenRouter with caching, rate limiting, and unified billing.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @cloudflare/tanstack-ai @tanstack/ai
vue: @cloudflare/tanstack-ai @tanstack/ai
solid: @cloudflare/tanstack-ai @tanstack/ai
svelte: @cloudflare/tanstack-ai @tanstack/ai
preact: @cloudflare/tanstack-ai @tanstack/ai
angular: @cloudflare/tanstack-ai @tanstack/ai
vanilla: @cloudflare/tanstack-ai @tanstack/ai
octane: @cloudflare/tanstack-ai @tanstack/ai

<!-- ::end:tabs -->

For AI Gateway with third-party providers, install the provider SDKs you need:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-openai
react: @tanstack/ai-anthropic
react: @tanstack/ai-gemini
react: @tanstack/ai-grok
react: @tanstack/ai-openrouter
vue: @tanstack/ai-openai
vue: @tanstack/ai-anthropic
vue: @tanstack/ai-gemini
vue: @tanstack/ai-grok
vue: @tanstack/ai-openrouter
solid: @tanstack/ai-openai
solid: @tanstack/ai-anthropic
solid: @tanstack/ai-gemini
solid: @tanstack/ai-grok
solid: @tanstack/ai-openrouter
svelte: @tanstack/ai-openai
svelte: @tanstack/ai-anthropic
svelte: @tanstack/ai-gemini
svelte: @tanstack/ai-grok
svelte: @tanstack/ai-openrouter
preact: @tanstack/ai-openai
preact: @tanstack/ai-anthropic
preact: @tanstack/ai-gemini
preact: @tanstack/ai-grok
preact: @tanstack/ai-openrouter
angular: @tanstack/ai-openai
angular: @tanstack/ai-anthropic
angular: @tanstack/ai-gemini
angular: @tanstack/ai-grok
angular: @tanstack/ai-openrouter
vanilla: @tanstack/ai-openai
vanilla: @tanstack/ai-anthropic
vanilla: @tanstack/ai-gemini
vanilla: @tanstack/ai-grok
vanilla: @tanstack/ai-openrouter
octane: @tanstack/ai-openai
octane: @tanstack/ai-anthropic
octane: @tanstack/ai-gemini
octane: @tanstack/ai-grok
octane: @tanstack/ai-openrouter

<!-- ::end:tabs -->

## Basic Usage

```typescript
import { chat, toHttpResponse } from "@tanstack/ai";
import { createWorkersAiChat } from "@cloudflare/tanstack-ai";
import { env } from "./env";

const adapter = createWorkersAiChat(
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  { binding: env.AI },
);

const response = chat({
  adapter,
  stream: true,
  messages: [{ role: "user", content: "Hello!" }],
});

const httpResponse = toHttpResponse(response);
```

## Workers AI

The simplest way to use AI in a Cloudflare Worker. No API keys needed when using the `env.AI` binding.

### Chat

```typescript
import { chat, toHttpResponse } from "@tanstack/ai";
import { createWorkersAiChat } from "@cloudflare/tanstack-ai";
import { env } from "./env";

const adapter = createWorkersAiChat(
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  { binding: env.AI },
);

const response = chat({
  adapter,
  stream: true,
  messages: [{ role: "user", content: "Hello!" }],
});

const httpResponse = toHttpResponse(response);
```

### Chat with REST Credentials

If you're not running inside a Worker, use account ID and API key instead:

```typescript
import { createWorkersAiChat } from "@cloudflare/tanstack-ai";

const adapter = createWorkersAiChat(
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  {
    accountId: "your-account-id",
    apiKey: "your-api-key",
  },
);
```

### Image Generation

```typescript
import { generateImage } from "@tanstack/ai";
import { createWorkersAiImage } from "@cloudflare/tanstack-ai";
import { env } from "./env";

const adapter = createWorkersAiImage(
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  { binding: env.AI },
);

const result = await generateImage({
  adapter,
  prompt: "a cat in space",
});

console.log(result.images[0]?.b64Json);
```

### Transcription (Speech-to-Text)

Supports Whisper and Deepgram models:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { createWorkersAiTranscription } from "@cloudflare/tanstack-ai";
import { env, audioArrayBuffer } from "./env";

const adapter = createWorkersAiTranscription(
  "@cf/openai/whisper-large-v3-turbo",
  { binding: env.AI },
);

const result = await generateTranscription({
  adapter,
  audio: audioArrayBuffer,
});

console.log(result.text);
console.log(result.segments);
```

Supported transcription models: `@cf/openai/whisper`, `@cf/openai/whisper-tiny-en`, `@cf/openai/whisper-large-v3-turbo`, `@cf/deepgram/nova-3`

### Text-to-Speech

```typescript
import { generateSpeech } from "@tanstack/ai";
import { createWorkersAiTts } from "@cloudflare/tanstack-ai";
import { env } from "./env";

const adapter = createWorkersAiTts("@cf/deepgram/aura-2-en", {
  binding: env.AI,
});

const result = await generateSpeech({
  adapter,
  text: "Hello world",
});

console.log(result.audio);
```

### Summarization

```typescript
import { summarize, type AnySummarizeAdapter } from "@tanstack/ai";
import { createWorkersAiSummarize } from "@cloudflare/tanstack-ai";
import { env } from "./env";

const adapter: AnySummarizeAdapter = createWorkersAiSummarize("@cf/facebook/bart-large-cnn", {
  binding: env.AI,
});

const result = await summarize({
  adapter,
  text: "Long article here...",
});

console.log(result.summary);
```

## AI Gateway

Route AI requests through Cloudflare's AI Gateway for caching, rate limiting, and unified billing. Supports both Workers AI and third-party providers.

### Workers AI through Gateway

```typescript
import { createWorkersAiChat } from "@cloudflare/tanstack-ai";
import { env } from "./env";

const adapter = createWorkersAiChat(
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  {
    binding: env.AI.gateway("my-gateway-id"),
    apiKey: env.WORKERS_AI_TOKEN,
  },
);
```

### Third-Party Providers through Gateway

Use the binding approach (recommended for Cloudflare Workers):

```typescript
import {
  createOpenAiChat,
  createAnthropicChat,
  createGeminiChat,
  createGrokChat,
  createOpenRouterChat,
} from "@cloudflare/tanstack-ai";
import { env } from "./env";

const openai = createOpenAiChat("gpt-4o", {
  binding: env.AI.gateway("my-gateway-id"),
});

const anthropic = createAnthropicChat("claude-sonnet-4-5", {
  binding: env.AI.gateway("my-gateway-id"),
});

const grok = createGrokChat("grok-4.3", {
  binding: env.AI.gateway("my-gateway-id"),
});

const openrouter = createOpenRouterChat("openai/gpt-4o", {
  binding: env.AI.gateway("my-gateway-id"),
});
```

Or use credentials for non-Worker environments:

```typescript
import { createOpenAiChat } from "@cloudflare/tanstack-ai";

const adapter = createOpenAiChat("gpt-4o", {
  accountId: "your-account-id",
  gatewayId: "your-gateway-id",
  cfApiKey: "your-cf-api-key",
  apiKey: "provider-api-key",
});
```

### Cache Options

Both binding and credentials modes support cache configuration:

```typescript
import { createOpenAiChat } from "@cloudflare/tanstack-ai";
import { env } from "./env";

const adapter = createOpenAiChat("gpt-4o", {
  binding: env.AI.gateway("my-gateway-id"),
  skipCache: false,
  cacheTtl: 3600,
  customCacheKey: "my-key",
  metadata: { user: "test" },
});
```

## Configuration Modes

Workers AI supports four configuration modes:

| Mode | Config | Description |
|------|--------|-------------|
| Plain binding | `{ binding: env.AI }` | Direct access, no gateway |
| Plain REST | `{ accountId, apiKey }` | REST API, no gateway |
| Gateway binding | `{ binding: env.AI.gateway(id) }` | Through AI Gateway via binding |
| Gateway REST | `{ accountId, gatewayId, ... }` | Through AI Gateway via REST |

Third-party providers (OpenAI, Anthropic, Gemini, Grok, OpenRouter) only support the gateway modes.

## Supported Capabilities

| Provider | Chat | Summarize | Image Gen | Transcription | TTS |
|----------|------|-----------|-----------|---------------|-----|
| **Workers AI** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OpenAI** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Anthropic** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Gemini** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Grok** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **OpenRouter** | ✅ | ✅ | ✅ | ❌ | ❌ |

## Environment Variables

For the REST credential path (outside of Cloudflare Workers):

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_KEY=your-api-key
```

When using the `env.AI` binding inside a Worker, no environment variables are needed.

## API Reference

### Workers AI

- `createWorkersAiChat(model, config)` — Chat and structured output
- `createWorkersAiImage(model, config)` — Image generation
- `createWorkersAiTranscription(model, config)` — Speech-to-text (Whisper, Deepgram)
- `createWorkersAiTts(model, config)` — Text-to-speech (Deepgram Aura)
- `createWorkersAiSummarize(model, config)` — Summarization (BART-large-CNN)

### Gateway Providers

- `createOpenAiChat(model, config)` / `createOpenAiSummarize` / `createOpenAiImage` / `createOpenAiTranscription` / `createOpenAiTts`
- `createAnthropicChat(model, config)` / `createAnthropicSummarize`
- `createGeminiChat(model, config)` / `createGeminiSummarize` / `createGeminiImage` / `createGeminiTts`
- `createGrokChat(model, config)` / `createGrokSummarize` / `createGrokImage`
- `createOpenRouterChat(model, config)` / `createOpenRouterSummarize` / `createOpenRouterImage`

## Next Steps

- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) — Workers AI documentation
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) — AI Gateway documentation
- [GitHub Repository](https://github.com/cloudflare/ai) — Source code and issues
- [Streaming Guide](../chat/streaming) — Learn about streaming responses
- [Tools Guide](../tools/tools) — Learn about tool calling
