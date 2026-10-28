---
title: Cloudflare
id: cloudflare-adapter
order: 3
description: "Use Cloudflare's own @cloudflare/tanstack-ai package for Workers AI models and AI Gateway routing, with caching, rate limits, and one bill across providers."
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

`@cloudflare/tanstack-ai` is the community Cloudflare package. It provides:

- [Workers AI](https://developers.cloudflare.com/workers-ai/) models, which run on the Cloudflare network.
- [AI Gateway](https://developers.cloudflare.com/ai-gateway/) routing to OpenAI, Anthropic, Gemini, Grok, and OpenRouter, with caching, rate limits, and one bill.

Cloudflare maintains this package. TanStack AI also has its own Cloudflare adapter, `@tanstack/ai-cloudflare`. See the [Cloudflare adapter](../adapters/cloudflare) page.

## 1. Install

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

## 2. Set up access

Inside a Cloudflare Worker, use the `env.AI` binding. You need no API key.

Outside a Worker, use the REST credentials. Put them in the environment of your server:

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_KEY=your-api-key
```

## 3. Stream a chat

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
  threadId: "thread-1",
});

const httpResponse = toHttpResponse(response);
```

Return `httpResponse` from your Worker. Outside a Worker, pass the account ID and the API key:

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

## Images

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
  threadId: "thread-1",
});

console.log(result.images[0]?.b64Json);
```

## Transcription

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
  threadId: "thread-1",
});

console.log(result.text);
console.log(result.segments);
```

Transcription models: `@cf/openai/whisper`, `@cf/openai/whisper-tiny-en`, `@cf/openai/whisper-large-v3-turbo`, and `@cf/deepgram/nova-3`.

## Speech

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
  threadId: "thread-1",
});

console.log(result.audio);
```

## Summarization

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
  threadId: "thread-1",
});

console.log(result.summary);
```

## AI Gateway

Send requests through AI Gateway to get caching, rate limits, and one bill. It works for Workers AI and for other providers.

Workers AI through the gateway:

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

Other providers through the gateway. For other providers, also install their TanStack AI packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-openai @tanstack/ai-anthropic @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-openrouter
vue: @tanstack/ai-openai @tanstack/ai-anthropic @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-openrouter
solid: @tanstack/ai-openai @tanstack/ai-anthropic @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-openrouter
svelte: @tanstack/ai-openai @tanstack/ai-anthropic @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-openrouter
preact: @tanstack/ai-openai @tanstack/ai-anthropic @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-openrouter
angular: @tanstack/ai-openai @tanstack/ai-anthropic @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-openrouter
vanilla: @tanstack/ai-openai @tanstack/ai-anthropic @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-openrouter
octane: @tanstack/ai-openai @tanstack/ai-anthropic @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-openrouter

<!-- ::end:tabs -->

Install only the providers that you use. In a Worker, use the binding:

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

Outside a Worker, use the credentials:

```typescript
import { createOpenAiChat } from "@cloudflare/tanstack-ai";

const adapter = createOpenAiChat("gpt-4o", {
  accountId: "your-account-id",
  gatewayId: "your-gateway-id",
  cfApiKey: "your-cf-api-key",
  apiKey: "provider-api-key",
});
```

### Cache options

The binding mode and the credentials mode both take cache options:

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

## Models and options

### Configuration modes

Workers AI has four modes:

| Mode | Config | What it does |
|------|--------|-------------|
| Plain binding | `{ binding: env.AI }` | Direct access, no gateway. |
| Plain REST | `{ accountId, apiKey }` | REST API, no gateway. |
| Gateway binding | `{ binding: env.AI.gateway(id) }` | Through AI Gateway, with the binding. |
| Gateway REST | `{ accountId, gatewayId, ... }` | Through AI Gateway, with REST. |

Other providers (OpenAI, Anthropic, Gemini, Grok, OpenRouter) work only in the gateway modes.

### Capabilities

| Provider | Chat | Summarize | Images | Transcription | Speech |
|----------|------|-----------|-----------|---------------|-----|
| **Workers AI** | Yes | Yes | Yes | Yes | Yes |
| **OpenAI** | Yes | Yes | Yes | Yes | Yes |
| **Anthropic** | Yes | Yes | No | No | No |
| **Gemini** | Yes | Yes | Yes | No | Yes |
| **Grok** | Yes | Yes | Yes | No | No |
| **OpenRouter** | Yes | Yes | Yes | No | No |

### Workers AI factories

- `createWorkersAiChat(model, config)`: chat and structured output.
- `createWorkersAiImage(model, config)`: images.
- `createWorkersAiTranscription(model, config)`: speech to text (Whisper, Deepgram).
- `createWorkersAiTts(model, config)`: text to speech (Deepgram Aura).
- `createWorkersAiSummarize(model, config)`: summarization (BART-large-CNN).

### Gateway provider factories

- OpenAI: `createOpenAiChat(model, config)`, `createOpenAiSummarize`, `createOpenAiImage`, `createOpenAiTranscription`, `createOpenAiTts`.
- Anthropic: `createAnthropicChat(model, config)`, `createAnthropicSummarize`.
- Gemini: `createGeminiChat(model, config)`, `createGeminiSummarize`, `createGeminiImage`, `createGeminiTts`.
- Grok: `createGrokChat(model, config)`, `createGrokSummarize`, `createGrokImage`.
- OpenRouter: `createOpenRouterChat(model, config)`, `createOpenRouterSummarize`, `createOpenRouterImage`.

The source and the issues are on [GitHub](https://github.com/cloudflare/ai).
