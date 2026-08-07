---
title: Cloudflare
id: cloudflare-adapter
order: 3
description: "Workers AI and AI Gateway with TanStack AI — edge chat, image, STT, TTS, summarize, caching."
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

# Cloudflare

If you run on Workers AI or need AI Gateway routing → use `@cloudflare/tanstack-ai`.

## Install

```bash
npm install @cloudflare/tanstack-ai @tanstack/ai
```

Gateway + third-party providers (as needed):

```bash
npm install @tanstack/ai-openai @tanstack/ai-anthropic @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-openrouter
```

## Workers AI chat

No API key with `env.AI` binding:

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

Outside a Worker — REST credentials:

```typescript
import { createWorkersAiChat } from "@cloudflare/tanstack-ai";

const adapter = createWorkersAiChat(
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  { accountId: "your-account-id", apiKey: "your-api-key" },
);
```

## Other Workers AI capabilities

```typescript
import { env, audioArrayBuffer } from "./env";

// Image
import { generateImage } from "@tanstack/ai";
import { createWorkersAiImage } from "@cloudflare/tanstack-ai";

const result = await generateImage({
  adapter: createWorkersAiImage(
    "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    { binding: env.AI },
  ),
  prompt: "a cat in space",
});

// Transcription (Whisper / Deepgram)
import { generateTranscription } from "@tanstack/ai";
import { createWorkersAiTranscription } from "@cloudflare/tanstack-ai";

const transcript = await generateTranscription({
  adapter: createWorkersAiTranscription(
    "@cf/openai/whisper-large-v3-turbo",
    { binding: env.AI },
  ),
  audio: audioArrayBuffer,
});

// TTS
import { generateSpeech } from "@tanstack/ai";
import { createWorkersAiTts } from "@cloudflare/tanstack-ai";

const speech = await generateSpeech({
  adapter: createWorkersAiTts("@cf/deepgram/aura-2-en", { binding: env.AI }),
  text: "Hello world",
});

// Summarize
import { summarize, type AnySummarizeAdapter } from "@tanstack/ai";
import { createWorkersAiSummarize } from "@cloudflare/tanstack-ai";

const adapter: AnySummarizeAdapter = createWorkersAiSummarize(
  "@cf/facebook/bart-large-cnn",
  { binding: env.AI },
);
const summary = await summarize({ adapter, text: "Long article here..." });
```

Transcription models: `@cf/openai/whisper`, `@cf/openai/whisper-tiny-en`, `@cf/openai/whisper-large-v3-turbo`, `@cf/deepgram/nova-3`.

## AI Gateway

Workers AI through gateway:

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

Third-party via gateway binding:

```typescript
import {
  createOpenAiChat,
  createAnthropicChat,
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

REST gateway (non-Worker):

```typescript
import { createOpenAiChat } from "@cloudflare/tanstack-ai";

const adapter = createOpenAiChat("gpt-4o", {
  accountId: "your-account-id",
  gatewayId: "your-gateway-id",
  cfApiKey: "your-cf-api-key",
  apiKey: "provider-api-key",
});
```

Cache options: `skipCache`, `cacheTtl`, `customCacheKey`, `metadata`.

## Config modes

| Mode | Config |
|------|--------|
| Plain binding | `{ binding: env.AI }` |
| Plain REST | `{ accountId, apiKey }` |
| Gateway binding | `{ binding: env.AI.gateway(id) }` |
| Gateway REST | `{ accountId, gatewayId, … }` |

Third-party providers support gateway modes only.

## Capabilities

| Provider | Chat | Summarize | Image | STT | TTS |
|----------|------|-----------|-------|-----|-----|
| Workers AI | ✅ | ✅ | ✅ | ✅ | ✅ |
| OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anthropic | ✅ | ✅ | ❌ | ❌ | ❌ |
| Gemini | ✅ | ✅ | ✅ | ❌ | ✅ |
| Grok / OpenRouter | ✅ | ✅ | ✅ | ❌ | ❌ |

REST env (outside Workers):

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_KEY=your-api-key
```

## API surface

**Workers AI:** `createWorkersAiChat` · `createWorkersAiImage` · `createWorkersAiTranscription` · `createWorkersAiTts` · `createWorkersAiSummarize`

**Gateway:** `createOpenAi*` / `createAnthropic*` / `createGemini*` / `createGrok*` / `createOpenRouter*` (Chat, Summarize, Image, Transcription, Tts as supported)

## Links

- [Workers AI](https://developers.cloudflare.com/workers-ai/) · [AI Gateway](https://developers.cloudflare.com/ai-gateway/) · [GitHub](https://github.com/cloudflare/ai)
- [Streaming](../chat/streaming) · [Tools](../tools/tools)
