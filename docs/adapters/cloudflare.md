---
title: Cloudflare
id: cloudflare-adapter
description: "Run Workers AI chat, embeddings, images, speech, transcription, and evaluate from a Cloudflare Worker or any server, and send other providers through AI Gateway, with TanStack AI."
keywords:
  - tanstack ai
  - cloudflare
  - workers ai
  - ai gateway
  - env.AI
  - edge inference
  - adapter
  - evaluate
  - jev
---

Cloudflare gives you the Workers AI models, plus AI Gateway in front of any provider. Use this adapter when:

- You have a Cloudflare Worker and want an AI route with no API keys to manage.
- You have a server somewhere else and want to call Workers AI models.
- You use OpenAI or Anthropic and want AI Gateway caching and logs in front of them.

## 1. Install

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

## 2. Connect to Cloudflare

Inside a Worker, use the `env.AI` binding. You need no token and no account id. Add the binding to `wrangler.jsonc`:

```jsonc
{
  "ai": { "binding": "AI" },
}
```

On any other server, the adapter calls the Cloudflare REST API. Put your account id and an API token with Workers AI access in the environment of your server:

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

Get the account id from `wrangler whoami`. Create the token in the Cloudflare dashboard, under Workers AI, then Use REST API.

## 3. Stream a chat from the server

From a Worker, pass `env.AI` as the binding:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createCloudflareText } from "@tanstack/ai-cloudflare";
import type { Ai } from "@cloudflare/workers-types";

interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env) {
    const { messages, threadId, runId } = await chatParamsFromRequest(request);

    const stream = chat({
      adapter: createCloudflareText("@cf/zai-org/glm-5.3-flash", {
        binding: env.AI,
      }),
      messages,
      threadId,
      runId,
    });

    return toServerSentEventsResponse(stream);
  },
};
```

Run `wrangler dev` to start the route.

From any other server, `cloudflareText` reads `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { cloudflareText } from "@tanstack/ai-cloudflare";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: cloudflareText("@cf/zai-org/glm-5.3-flash"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

To pass the values in code, use `createCloudflareText`:

```typescript
import { createCloudflareText } from "@tanstack/ai-cloudflare";

const adapter = createCloudflareText("@cf/zai-org/glm-5.3-flash", {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  apiKey: process.env.CLOUDFLARE_API_TOKEN!,
});
```

## 4. Render the chat

The client is the same for every provider. Point `useChat` at your route:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sendMessage(input);
        setInput("");
      }}
    >
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts
            .map((part) => (part.type === "text" ? part.content : ""))
            .join("")}
        </p>
      ))}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
    </form>
  );
}
```

For Vue, Solid, Svelte, Angular, and the other frameworks, see [Quick Start](../getting-started/quick-start#3-render-the-chat).

You now have a streaming chat on Workers AI. [Tools](../tools/tools) and [Structured Outputs](../structured-outputs/overview) work the same as with every adapter.

## Route through AI Gateway

AI Gateway gives you caching, logs, rate limits, and one bill for all providers. To send requests through it, add `gateway` to any config. Use `"default"` for the gateway that Cloudflare makes for your account:

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

With a gateway, you can also run third-party models by their catalog id. Cloudflare bills them:

```typescript
import { createCloudflareText } from "@tanstack/ai-cloudflare";

const adapter = createCloudflareText("openai/gpt-5.5", {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  apiKey: process.env.CLOUDFLARE_API_TOKEN!,
  gateway: { id: "default" },
});
```

### Keep your existing provider adapter

Do you use `@tanstack/ai-openai` with your own OpenAI key? `cloudflareGateway()` returns the `baseURL` and the headers that point that adapter at your gateway. The rest of your code stays the same:

```typescript
import { createOpenaiChat } from "@tanstack/ai-openai";
import { cloudflareGateway } from "@tanstack/ai-cloudflare";

const gateway = cloudflareGateway("openai", {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  gatewayId: "prod",
  cacheTtl: 300,
});

const adapter = createOpenaiChat("gpt-6.1-sol", process.env.OPENAI_API_KEY!, {
  baseURL: gateway.baseURL,
  defaultHeaders: gateway.headers,
});
```

- The first argument is the provider slug from your gateway dashboard, for example `openai`, `anthropic`, or `groq`.
- If the gateway has authentication on, also pass `cfApiKey`. That token needs the `AI Gateway Run` permission.

The `ts-react-chat` example does this. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_AI_GATEWAY_ID` in its `.env`. Then the Cloudflare, OpenAI, Anthropic, and Groq models in its picker all go through your gateway.

### Claude and GPT from a Worker

Inside a Worker, the AI Gateway `anthropic/...` and `openai/...` models use the API of their own provider, not Chat Completions. Keep the provider adapter, and give it `cloudflareBindingFetch` as its `fetch`. The binding signs the requests, so the Worker needs no provider key:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { cloudflareBindingFetch } from "@tanstack/ai-cloudflare";
import type { Ai } from "@cloudflare/workers-types";

interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env) {
    const { messages, threadId, runId } = await chatParamsFromRequest(request);

    // The SDK needs a key value. The binding does not use it.
    const adapter = createAnthropicChat("claude-opus-5-5", "cloudflare-binding", {
      fetch: cloudflareBindingFetch({
        binding: env.AI,
        vendor: "anthropic",
        gateway: { id: "default" },
      }),
    });

    const stream = chat({ adapter, messages, threadId, runId, reasoning: "high" });
    return toServerSentEventsResponse(stream);
  },
};
```

- `vendor: "anthropic"` sends Anthropic Messages requests to `anthropic/<model>`. Use it with `createAnthropicChat`.
- `vendor: "openai"` sends OpenAI Responses requests to `openai/<model>`. Use it with `createOpenaiChat`.
- The adapter keeps all of its options: `chat({ reasoning })`, tools, `cache_control` for prompt caching, and Anthropic betas (sent as the `anthropic-beta` header).
- For `@cf/...` models and other gateway vendors, keep `createCloudflareText` with `binding: env.AI`.

## Bring your own key

Two different things have this name. Both work.

### Cloudflare credentials of a user, from the browser

A user brings two values: the API token, and the account that it belongs to.

- `cloudflareByok` and `cloudflareAccountByok` are two entries in the TanStack BYOK store. Each one has its own env fallback.
- `cloudflareByok` declares the account id as a companion. Register both, and a send for `cloudflare` carries both headers.
- Import them from `@tanstack/ai-cloudflare/byok`, not from the main entry.

On the client:

```typescript
import { defineByok, defaultByokStorage } from "@tanstack/ai-client/byok";
import {
  cloudflareAccountByok,
  cloudflareByok,
} from "@tanstack/ai-cloudflare/byok";

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: [cloudflareByok, cloudflareAccountByok],
});
```

On the relay, read both values in one call:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createCloudflareText } from "@tanstack/ai-cloudflare";
import {
  cloudflareAccountByok,
  cloudflareByok,
} from "@tanstack/ai-cloudflare/byok";
import { byokMissing, getByokKeys } from "@tanstack/ai/byok/server";

export async function POST(request: Request) {
  const { apiKey, accountId } = getByokKeys(request, {
    apiKey: cloudflareByok,
    accountId: cloudflareAccountByok,
  });
  if (!apiKey) return byokMissing(cloudflareByok);
  if (!accountId) return byokMissing(cloudflareAccountByok);

  const { messages, threadId, runId } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: createCloudflareText("@cf/zai-org/glm-5.3-flash", {
      accountId,
      apiKey,
    }),
    messages,
    threadId,
    runId,
  });
  return toServerSentEventsResponse(stream);
}
```

See [Bring Your Own Key](../advanced/byok) for the client store and the save dialog.

### Your provider keys stored in AI Gateway

Add an OpenAI or Anthropic key under Provider Keys in the gateway dashboard, with the alias `default`. Then a `provider/model` id with `gateway: { id }` uses that key, not Unified Billing. You change no code.

## Evaluate

Sometimes you need an answer that your code can branch on, not chat text. Use `cloudflareDecider("typesafe/jev")` with `decide()`. To send the run through AI Gateway, add `gateway: { id: "default" }` to the adapter config.

From a Worker, pass the binding:

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { createCloudflareDecider } from "@tanstack/ai-cloudflare";
import type { Ai } from "@cloudflare/workers-types";

interface Env {
  AI: Ai;
}

const ticket = {
  subject: "Charged twice for the same invoice",
  body: "Please refund the extra payment.",
};

export async function evaluateTicket(env: Env) {
  const result = await decide({
    adapter: createCloudflareDecider("typesafe/jev", {
      binding: env.AI,
      gateway: { id: "default" },
    }),
    state: ticket,
    questions: {
      queue: choice({
        instructions: "Which team should handle this ticket?",
        options: {
          billing: "Payments, invoices, refunds",
          tech: "Bugs, outages, integrations",
          sales: "Pricing, upgrades, new accounts",
        },
      }),
      urgency: score({
        instructions: "How urgent is this ticket?",
        levels: ["low", "medium", "high"],
      }),
      refund: boolean({
        instructions: "Is the customer asking for a refund?",
      }),
    },
  });

  return result;
}
```

From any other server, `cloudflareDecider` reads `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`:

```typescript
import { decide, boolean } from "@tanstack/ai";
import { cloudflareDecider } from "@tanstack/ai-cloudflare";

const result = await decide({
  adapter: cloudflareDecider("typesafe/jev"),
  state: "Please refund the extra payment.",
  questions: {
    refund: boolean({
      instructions: "Is the customer asking for a refund?",
    }),
  },
});

console.log(result.refund.value);
```

See the [Evaluate guide](../evaluate/evaluate) for the question helpers, the result shape, abort, and middleware.

## Summarize, embed, and media

Every activity takes the same config as chat:

- Inside a Worker: `{ binding }`.
- On any other server: `{ accountId, apiKey }`.
- Both take an optional `gateway`.

The samples below use the factories that read the environment.

### Summarize

```typescript
import { summarize } from "@tanstack/ai";
import { cloudflareSummarize } from "@tanstack/ai-cloudflare";

const result = await summarize({
  adapter: cloudflareSummarize("@cf/zai-org/glm-5.3-flash"),
  text: "Long article text...",
  stream: false,
});

console.log(result.summary);
```

### Embeddings

```typescript
import { embed } from "@tanstack/ai";
import { cloudflareEmbedding } from "@tanstack/ai-cloudflare";

const result = await embed({
  adapter: cloudflareEmbedding("@cf/baai/bge-m3"),
  input: ["a story about a llama", "a story about a cloud"],
});

console.log(result.embeddings[0]?.vector);
```

### Images

```typescript
import { generateImage } from "@tanstack/ai";
import { cloudflareImage } from "@tanstack/ai-cloudflare";

const result = await generateImage({
  adapter: cloudflareImage("@cf/black-forest-labs/flux-1-schnell"),
  prompt: "a red bicycle on a beach",
  modelOptions: { steps: 4 },
});

console.log(result.images[0]?.b64Json);
```

### Text to speech

```typescript
import { generateSpeech } from "@tanstack/ai";
import { cloudflareTTS } from "@tanstack/ai-cloudflare";

const result = await generateSpeech({
  adapter: cloudflareTTS("@cf/deepgram/aura-2-en"),
  text: "Hello from the edge.",
  voice: "luna",
});

console.log(result.audio); // base64 MP3
```

### Transcription

```typescript
import { generateTranscription } from "@tanstack/ai";
import { cloudflareTranscription } from "@tanstack/ai-cloudflare";
import { audioBuffer } from "./audio";

const result = await generateTranscription({
  adapter: cloudflareTranscription("@cf/openai/whisper-large-v3-turbo"),
  audio: audioBuffer,
});

console.log(result.text, result.segments, result.words);
```

Pass the audio as a `File`, a `Blob`, an `ArrayBuffer`, or a base64 string. Whisper models take base64, and `@cf/deepgram/nova-3` takes the raw bytes. The adapter sends each model the format that it needs.

## Models and options

### Models

These ids work:

- Any id from the [Workers AI catalog](https://developers.cloudflare.com/workers-ai/models/).
- Any `provider/model` id from the [AI Gateway catalog](https://developers.cloudflare.com/ai/models/), when a gateway is set.

Ids in the bundled catalog get editor autocomplete.

### Model options

Sampling options go in `modelOptions`. The thinking level goes in `reasoning`:

```typescript
import { chat } from "@tanstack/ai";
import { cloudflareText } from "@tanstack/ai-cloudflare";

const stream = chat({
  adapter: cloudflareText("@cf/zai-org/glm-5.3-flash"),
  messages: [{ role: "user", content: "Summarize this in one sentence." }],
  modelOptions: {
    temperature: 0.3,
    max_tokens: 512,
  },
  reasoning: "low",
});
```

### Reasoning

`reasoning` goes out as `reasoning_effort`. `off` sends `null`, which turns thinking off. Reasoning models stream their thinking as `reasoning_content`, which you get as `REASONING_*` events.

Some models and their levels:

| Model | Levels |
| --- | --- |
| `@cf/zai-org/glm-5.3`, `@cf/zai-org/glm-5.3-flash` | `low`, `high`, `max` |
| `@cf/deepseek-ai/deepseek-v4-pro-0813`, `@cf/deepseek-ai/deepseek-v4-flash-0731` | `off`, `low`, `high`, `max` |
| `@cf/qwen/qwen3.8-27b` | `off`, `low`, `medium`, `xhigh` |
| `@cf/openai/gpt-oss-120b`, `@cf/openai/gpt-oss-20b` | `low`, `medium`, `high` |

The types know the levels of each model. A model with no reasoning data takes no `reasoning`. See [Reasoning](../chat/reasoning).

## Advanced

### Client options on the REST path

- The text and summarize adapters also take the OpenAI SDK client options: `baseURL`, `defaultHeaders`, `fetch`, `timeout`, and `maxRetries`.
- The other adapters call the native `/ai/run` endpoint and take only `fetch`.

### Change the HTTP requests

Need a header on each request, or a log of each model call? The chat adapter supports [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call) on the REST path. In binding mode, the wrapper still runs. But the binding reads only the request body, so it drops the URL and the headers that the wrapper sets.

### Tools and prompts added during a conversation

Two kinds of adapter send the full tools and system prompts on every call:

- An adapter with a gateway `baseURL` from `cloudflareGateway()`.
- An adapter with `cloudflareBindingFetch`.

This is also true on a model with a [mid-conversation channel](../advanced/mid-conversation-changes). So AI Gateway gets the same request as on any other model. To send tools and prompts added during a conversation through the channel, set `midConversationChannels: true`:

```typescript
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { cloudflareBindingFetch } from "@tanstack/ai-cloudflare";
import type { Ai } from "@cloudflare/workers-types";

export function gatewayClaude(env: { AI: Ai }) {
  return createAnthropicChat("claude-opus-5-5", "cloudflare-binding", {
    fetch: cloudflareBindingFetch({
      binding: env.AI,
      vendor: "anthropic",
      gateway: { id: "default" },
    }),
    midConversationChannels: true,
  });
}
```
