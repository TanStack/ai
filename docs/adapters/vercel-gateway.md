---
title: Vercel AI Gateway
id: vercel-gateway-adapter
description: "Reach many providers with one API key through Vercel AI Gateway and @tanstack/ai-vercel-gateway: chat, provider fallback, embeddings, images, summaries, and evaluate."
keywords:
  - tanstack ai
  - vercel
  - ai gateway
  - adapter
  - routing
  - fallback
  - embeddings
  - image generation
  - evaluate
  - jev
---

`vercelGatewayText` calls many providers through one API key and one URL. You pick the provider per request, and you can set a fallback order.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-vercel-gateway
vue: @tanstack/ai-vercel-gateway
solid: @tanstack/ai-vercel-gateway
svelte: @tanstack/ai-vercel-gateway
preact: @tanstack/ai-vercel-gateway
angular: @tanstack/ai-vercel-gateway
vanilla: @tanstack/ai-vercel-gateway
octane: @tanstack/ai-vercel-gateway

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
AI_GATEWAY_API_KEY=vck_...
```

The adapters read `AI_GATEWAY_API_KEY`. If it is not set, they read `VERCEL_OIDC_TOKEN`. To pass the key in code, use the `create*` factory of the same adapter:

```typescript
import { createVercelGatewayText } from "@tanstack/ai-vercel-gateway";

const adapter = createVercelGatewayText(
  "anthropic/claude-sonnet-5.5",
  process.env.AI_GATEWAY_API_KEY!,
);
```

## 3. Stream a chat from the server

Model ids use the `creator/model` form:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { vercelGatewayText } from "@tanstack/ai-vercel-gateway";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: vercelGatewayText("anthropic/claude-sonnet-5.5"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
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
    threadId: "support-chat",
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

You now have a streaming chat through the gateway. To change the provider, change the model id, for example to `openai/gpt-6.1-sol`.

## Fallback and routing

Put the routing options in `modelOptions.gateway`:

```typescript
import { chat } from "@tanstack/ai";
import { vercelGatewayText } from "@tanstack/ai-vercel-gateway";

const stream = chat({
  adapter: vercelGatewayText("anthropic/claude-sonnet-5.5"),
  messages: [{ role: "user", content: "Hello" }],
  threadId: "thread-1",
  modelOptions: {
    gateway: {
      order: ["anthropic", "openai"],
      models: ["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol"],
      sort: "cost",
    },
  },
});
```

- `order`: the providers to try, in this order.
- `only`: the only providers that can run the request.
- `sort`: sort by cost, time to first token, or tokens per second.
- `models`: the fallback models.
- `caching`, `disallowPromptTraining`, `zeroDataRetention`, and more: the other fields of the `VercelGatewayRoutingOptions` type.

`order` and `only` take catalog provider ids, such as `"anthropic"`. `models` takes catalog chat model ids. See [How routing goes out](#how-routing-goes-out).

## Embeddings

```typescript
import { embed } from "@tanstack/ai";
import { vercelGatewayEmbedding } from "@tanstack/ai-vercel-gateway";

const result = await embed({
  adapter: vercelGatewayEmbedding("openai/text-embedding-3-small"),
  input: "a red guitar",
});

console.log(result.embeddings[0]?.vector);
```

See the [Embeddings guide](../embeddings.md).

## Images

The image adapter makes images from text. It calls `POST /v1/images/generations`. It does not edit images.

```typescript
import { generateImage } from "@tanstack/ai";
import { vercelGatewayImage } from "@tanstack/ai-vercel-gateway";

const result = await generateImage({
  adapter: vercelGatewayImage("openai/gpt-image-2.5-flare"),
  prompt: "a red guitar",
  threadId: "thread-1",
});
```

See [Image Generation](../media/image-generation).

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { vercelGatewaySummarize } from "@tanstack/ai-vercel-gateway";

const result = await summarize({
  adapter: vercelGatewaySummarize("anthropic/claude-sonnet-5.5"),
  text: "The Fender Stratocaster is a versatile electric guitar.",
  threadId: "thread-1",
  stream: false,
});
```

## Evaluate

Sometimes you need an answer that your code can branch on, not chat text: a queue name, an urgency level, or a yes or no. Use `vercelGatewayDecider` with `decide()` to ask Jev typed questions:

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { vercelGatewayDecider } from "@tanstack/ai-vercel-gateway";

const ticket = {
  subject: "Charged twice for the same invoice",
  body: "Please refund the extra payment.",
};

const result = await decide({
  adapter: vercelGatewayDecider("typesafe-ai/jev"),
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

console.log(result.queue.value); // "billing"
console.log(result.urgency.value); // "medium"
console.log(result.refund.value); // true
```

- The request goes to `POST https://ai-gateway.vercel.sh/v4/ai/evaluation-model`.
- `vercelGatewayDecider` reads the same keys as chat. To pass a key yourself, use `createVercelGatewayDecider("typesafe-ai/jev", "vck_...")`.
- Gateway routing goes in `modelOptions.gateway`, the same as for chat.

See the [Evaluate guide](../evaluate/evaluate) for the question helpers, the result shape, abort, and middleware.

## Not in this package

This package does not do video, speech, transcription, or rerank. Use a dedicated adapter for these.

## Models and options

### Model options

Each chat model has its own `modelOptions` keys and input types from the catalog. For example:

- A text-only model does not accept image parts.
- A model without `temperature` in the catalog does not accept `temperature`.

### Reasoning

Set `reasoning` on `chat()`. The types take the levels of each model:

```typescript
import { chat } from "@tanstack/ai";
import { vercelGatewayText } from "@tanstack/ai-vercel-gateway";

const stream = chat({
  adapter: vercelGatewayText("anthropic/claude-opus-5", { api: "chat" }),
  messages: [{ role: "user", content: "Plan a database migration." }],
  threadId: "thread-1",
  reasoning: { level: "high", budgetTokens: 8000 },
});
```

What goes to the gateway:

- Chat Completions (`api: "chat"`): the gateway `reasoning` object. A level sends `{ effort }`. `budgetTokens` sends `{ enabled: true, max_tokens }`. `off` sends `{ enabled: false }`. `summary: false` adds `exclude: true`.
- Responses (the default): `reasoning.effort`. It takes no `budgetTokens`.

See [Reasoning](../chat/reasoning).

### Models

The catalog is a closed list from `GET /v1/models`. A daily CI job updates it. The package exports the lists:

| Constant | Holds |
| --- | --- |
| `VERCEL_GATEWAY_CHAT_MODELS` | Chat models, for example `anthropic/claude-sonnet-5.5` and `openai/gpt-6.1-sol` |
| `VERCEL_GATEWAY_EMBEDDING_MODELS` | Embedding models, for example `openai/text-embedding-3-small` and `voyage/voyage-4` |
| `VERCEL_GATEWAY_IMAGE_MODELS` | Image models, for example `openai/gpt-image-2.5-flare` and `bfl/flux-3-image` |
| `VERCEL_GATEWAY_PROVIDERS` | Provider ids for `order` and `only` |

The evaluate model is `typesafe-ai/jev`.

## Advanced

### Chat Completions

The default text adapter uses the OpenAI Responses API at `https://ai-gateway.vercel.sh/v1`. If a model must use Chat Completions, pass `{ api: "chat" }`:

```typescript
import { chat } from "@tanstack/ai";
import { vercelGatewayText } from "@tanstack/ai-vercel-gateway";

const stream = chat({
  adapter: vercelGatewayText("openai/gpt-5.5", { api: "chat" }),
  messages: [{ role: "user", content: "Hello" }],
  threadId: "thread-1",
});
```

- `api: "responses"` is the same as the default.
- `api: "chat-completions"` is the same as `api: "chat"`.

Need a header on each request, or a log of each model call? The chat adapters on this page support [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

### How routing goes out

The adapter sends `modelOptions.gateway` as `providerOptions.gateway`. Do not put `gateway` at the top level of the request body.

### Bring your own key

`vercelGatewayByok` from `@tanstack/ai-vercel-gateway/byok` declares the gateway for the BYOK store, with `AI_GATEWAY_API_KEY` and `VERCEL_OIDC_TOKEN` as its env vars. See [Bring Your Own Key](../advanced/byok).

### API reference

Each short factory reads `AI_GATEWAY_API_KEY`, then `VERCEL_OIDC_TOKEN`. Each `create*` factory takes an explicit API key. Both take `model` as the first argument.

| Factories | Creates |
| --- | --- |
| `vercelGatewayText` / `createVercelGatewayText` | Chat adapter (Responses by default, Chat Completions with `api: "chat"`) |
| `vercelGatewayResponsesText` / `createVercelGatewayResponsesText` | Chat adapter for the Responses API |
| `vercelGatewaySummarize` / `createVercelGatewaySummarize` | Summarization adapter |
| `vercelGatewayEmbedding` / `createVercelGatewayEmbedding` | Embedding adapter |
| `vercelGatewayImage` / `createVercelGatewayImage` | Image adapter |
| `vercelGatewayDecider` / `createVercelGatewayDecider` | Evaluate adapter |
