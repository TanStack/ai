---
title: Cloudflare
id: cloudflare-adapter
description: "Run Workers AI chat, embeddings, images, speech, and transcription from a Cloudflare Worker or any server, and route other providers through AI Gateway, with TanStack AI."
keywords:
  - tanstack ai
  - cloudflare
  - workers ai
  - ai gateway
  - env.AI
  - edge inference
  - adapter
---

You have a Cloudflare Worker and want an AI route without managing API keys. Or you have a server elsewhere and want to call Workers AI models. Or you already use OpenAI or Anthropic and want AI Gateway caching and logs in front of them. This adapter does all three.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-cloudflare
vue: @tanstack/ai-cloudflare
solid: @tanstack/ai-cloudflare
svelte: @tanstack/ai-cloudflare
preact: @tanstack/ai-cloudflare
angular: @tanstack/ai-cloudflare
vanilla: @tanstack/ai-cloudflare
octane: @tanstack/ai-cloudflare

<!-- ::end:tabs -->

## Chat from a Worker

Pass `env.AI` as the binding. No token, no account id.

1. Add the binding to `wrangler.jsonc`:

```jsonc
{
  "ai": { "binding": "AI" },
}
```

2. Stream a chat response from your Worker:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { createCloudflareText } from "@tanstack/ai-cloudflare";
import type { Ai } from "@cloudflare/workers-types";

interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env) {
    const { messages } = await request.json();

    const stream = chat({
      adapter: createCloudflareText("@cf/zai-org/glm-5.3-flash", {
        binding: env.AI,
      }),
      messages,
    });

    return toServerSentEventsResponse(stream);
  },
};
```

That is a working AI route. Run `wrangler dev` and post `{ "messages": [...] }` to it.

## Chat from anywhere else

Outside a Worker, the adapter talks to the Cloudflare REST API. You need your account id and an API token with Workers AI access.

```typescript
import { chat } from "@tanstack/ai";
import { createCloudflareText } from "@tanstack/ai-cloudflare";

const adapter = createCloudflareText("@cf/zai-org/glm-5.3-flash", {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  apiKey: process.env.CLOUDFLARE_API_TOKEN!,
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

`cloudflareText(model)` does the same and reads `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from the environment for you.

The REST config also accepts the OpenAI SDK client options (`baseURL`, `defaultHeaders`, `fetch`, `timeout`, `maxRetries`).

## Route through AI Gateway

AI Gateway gives you caching, logs, rate limits, and one bill across providers. Add `gateway` to any config to send requests through it. Use `"default"` for the gateway Cloudflare creates for your account.

```typescript
import { createCloudflareText } from "@tanstack/ai-cloudflare";
import type { Ai } from "@cloudflare/workers-types";

interface Env {
  AI: Ai;
}

export function makeAdapter(env: Env) {
  return createCloudflareText("@cf/zai-org/glm-5.3-flash", {
    binding: env.AI,
    gateway: { id: "default", cacheTtl: 3600, skipCache: false },
  });
}
```

With a gateway you can also run third-party models by their catalog id, billed through Cloudflare:

```typescript
import { createCloudflareText } from "@tanstack/ai-cloudflare";

const adapter = createCloudflareText("openai/gpt-5.5", {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  apiKey: process.env.CLOUDFLARE_API_TOKEN!,
  gateway: { id: "default" },
});
```

### Keep your existing provider adapter

Already using `@tanstack/ai-openai` with your own OpenAI key? `cloudflareGateway()` returns the `baseURL` and headers that point that adapter at your gateway. The rest of your code stays the same.

```typescript
import { createOpenaiChat } from "@tanstack/ai-openai";
import { cloudflareGateway } from "@tanstack/ai-cloudflare";

const gateway = cloudflareGateway("openai", {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  gatewayId: "prod",
  cacheTtl: 300,
});

const adapter = createOpenaiChat("gpt-5.5", process.env.OPENAI_API_KEY!, {
  baseURL: gateway.baseURL,
  defaultHeaders: gateway.headers,
});
```

The first argument is the provider slug from your gateway dashboard (`openai`, `anthropic`, `groq`, and so on). If the gateway has authentication turned on, pass `cfApiKey` too.

## Models

Any id from the [Workers AI catalog](https://developers.cloudflare.com/workers-ai/models/) works, and so does any `provider/model` id from the [AI Gateway catalog](https://developers.cloudflare.com/ai/models/) when a gateway is set. Catalog ids get editor autocomplete.

## Tools and structured output

Tools and `outputSchema` work the same as with every other adapter:

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { createCloudflareText } from "@tanstack/ai-cloudflare";
import { z } from "zod";
import type { Ai } from "@cloudflare/workers-types";

interface Env {
  AI: Ai;
}

const getWeather = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({ location: z.string() }),
}).server(async ({ location }) => {
  return { location, temperature: 21, conditions: "sunny" };
});

export default {
  async fetch(request: Request, env: Env) {
    const { messages } = await request.json();

    const stream = chat({
      adapter: createCloudflareText("@cf/zai-org/glm-5.3-flash", {
        binding: env.AI,
      }),
      messages,
      tools: [getWeather],
    });

    return toServerSentEventsResponse(stream);
  },
};
```

## Model options

Sampling and reasoning controls go in `modelOptions`. Reasoning models stream their thinking as `reasoning_content`, which shows up as `REASONING_*` events.

```typescript
import { chat } from "@tanstack/ai";
import { cloudflareText } from "@tanstack/ai-cloudflare";

const stream = chat({
  adapter: cloudflareText("@cf/zai-org/glm-5.3-flash"),
  messages: [{ role: "user", content: "Summarize this in one sentence." }],
  modelOptions: {
    temperature: 0.3,
    max_tokens: 512,
    reasoning_effort: "low",
    chat_template_kwargs: { enable_thinking: false },
  },
});
```

## Summarize, embed, and media

Every activity takes the same config as chat: `{ binding }` inside a Worker, `{ accountId, apiKey }` elsewhere, plus an optional `gateway`. The examples below use the env-reading factories.

Summarize:

```typescript
import { summarize } from "@tanstack/ai";
import { cloudflareSummarize } from "@tanstack/ai-cloudflare";

const result = await summarize({
  adapter: cloudflareSummarize("@cf/zai-org/glm-5.3-flash"),
  text: "Long article text...",
  stream: false,
});
```

Embeddings:

```typescript
import { embed } from "@tanstack/ai";
import { cloudflareEmbedding } from "@tanstack/ai-cloudflare";

const result = await embed({
  adapter: cloudflareEmbedding("@cf/baai/bge-m3"),
  input: ["a story about a llama", "a story about a cloud"],
});
// result.embeddings[0].vector
```

Images:

```typescript
import { generateImage } from "@tanstack/ai";
import { cloudflareImage } from "@tanstack/ai-cloudflare";

const result = await generateImage({
  adapter: cloudflareImage("@cf/black-forest-labs/flux-1-schnell"),
  prompt: "a red bicycle on a beach",
  modelOptions: { steps: 4 },
});
// result.images[0].b64Json
```

Text to speech:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { cloudflareTTS } from "@tanstack/ai-cloudflare";

const result = await generateSpeech({
  adapter: cloudflareTTS("@cf/deepgram/aura-2-en"),
  text: "Hello from the edge.",
  voice: "luna",
});
// result.audio is base64 MP3
```

Transcription:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { cloudflareTranscription } from "@tanstack/ai-cloudflare";
import { audioBuffer } from "./audio";

const result = await generateTranscription({
  adapter: cloudflareTranscription("@cf/openai/whisper-large-v3-turbo"),
  audio: audioBuffer,
});
// result.text, result.segments, result.words
```

Whisper models take the audio as base64. `@cf/deepgram/nova-3` takes the raw bytes. The adapter handles both, so pass a `File`, `Blob`, `ArrayBuffer`, or base64 string.

## Environment variables

For the REST path:

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

Get the account id from `wrangler whoami`. Create the token in the Cloudflare dashboard under Workers AI, then Use REST API.
