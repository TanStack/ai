---
title: LLM Gateway
id: llmgateway-adapter
description: "Reach hundreds of models from OpenAI, Anthropic, Google, Moonshot, DeepSeek, and more through one OpenAI-compatible LLM Gateway endpoint with @tanstack/ai-llmgateway. Hosted or self-hosted."
keywords:
  - tanstack ai
  - llm gateway
  - llmgateway
  - multi-provider
  - unified api
  - model router
  - self-hosted
  - adapter
---

[LLM Gateway](https://llmgateway.io) gives you hundreds of models from many providers behind one OpenAI-compatible endpoint. It picks a provider for you, falls back when a provider fails, and tracks usage and cost. Use the hosted gateway at `api.llmgateway.io`, or run your own copy, because it is open source.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-llmgateway
vue: @tanstack/ai-llmgateway
solid: @tanstack/ai-llmgateway
svelte: @tanstack/ai-llmgateway
preact: @tanstack/ai-llmgateway
angular: @tanstack/ai-llmgateway
vanilla: @tanstack/ai-llmgateway
octane: @tanstack/ai-llmgateway

<!-- ::end:tabs -->

## 2. Set the API key

Get a key from the [LLM Gateway dashboard](https://llmgateway.io). Put it in the environment of your server:

```bash
LLM_GATEWAY_API_KEY=llmgtwy_your-api-key
```

`llmGatewayText` and `llmGatewaySummarize` read `LLM_GATEWAY_API_KEY`. To pass the key in code, use the `create*` factory of the same adapter:

```typescript
import { createLLMGatewayText } from "@tanstack/ai-llmgateway";

const adapter = createLLMGatewayText("gpt-5.6-terra", process.env.LLM_GATEWAY_API_KEY!);
```

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { llmGatewayText } from "@tanstack/ai-llmgateway";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: llmGatewayText("gpt-5.6-terra"),
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

You now have a streaming chat through LLM Gateway. To try another model, change the id, for example to `claude-opus-5` or `kimi-k3`.

## Pick a model and a provider

Any model on [llmgateway.io/models](https://llmgateway.io/models) works. Pass its id as the model name:

- A bare id lets the gateway pick the best provider that is available.
- A `provider/` prefix always sends the request to that provider.

```text
model: "gpt-5.6-terra"          // the gateway picks the provider
model: "claude-sonnet-5"        // the gateway picks the provider
model: "moonshot/kimi-k3"       // always sent to Moonshot
model: "fireworks/kimi-k3"      // always sent to Fireworks
```

## Tools

Tools work the same as with every adapter:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from "@tanstack/ai";
import { llmGatewayText } from "@tanstack/ai-llmgateway";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({
    location: z.string(),
  }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  return { location, temperature: 72, conditions: "sunny" };
});

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: llmGatewayText("gpt-5.6-terra"),
    messages,
    threadId,
    runId,
    tools: [getWeather],
  });

  return toServerSentEventsResponse(stream);
}
```

See [Tools](../tools/tools).

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { llmGatewaySummarize } from "@tanstack/ai-llmgateway";

const result = await summarize({
  adapter: llmGatewaySummarize("gpt-5.4-mini"),
  text: "Long article text...",
  stream: false,
});

console.log(result.summary);
```

## Models and options

### Model options

The gateway takes the standard Chat Completions parameters and sends them to the provider that it picks. The gateway removes the parameters that a provider does not support. Sampling options go in `modelOptions`:

```typescript
import { chat } from "@tanstack/ai";
import { llmGatewayText } from "@tanstack/ai-llmgateway";

const stream = chat({
  adapter: llmGatewayText("kimi-k3"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    temperature: 0.7,
    max_completion_tokens: 4096,
  },
});
```

### Reasoning

Set `reasoning` on `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { llmGatewayText } from "@tanstack/ai-llmgateway";

const stream = chat({
  adapter: llmGatewayText("kimi-k3"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  reasoning: "high",
});
```

It goes out as `reasoning_effort`. The types take the levels of each model, and no `budgetTokens`:

| Model | Levels |
| --- | --- |
| `kimi-k3`, `glm-5.2`, `deepseek-v4-pro`, `qwen3.7-max` | `off` to `max` |
| `gpt-5.6-terra` | `off`, `low` to `max` |
| `gpt-5.5`, `gpt-5.4-mini` | `off`, `low` to `xhigh` |
| `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`, `minimax-m2.5` | `low` to `max` |
| `gemini-pro-latest`, `grok-4-5` | `low` to `high` |
| `gemini-3.6-flash` | `minimal` to `high` |

Reasoning models stream their thinking as `reasoning_content` deltas. The adapter turns them into AG-UI `REASONING_*` events. See [Reasoning](../chat/reasoning).

### Models

`LLMGATEWAY_CHAT_MODELS` is a curated set of flagship models. These models have type data for their input kinds and provider options, with autocomplete in the editor. Other ids still work. They get text-only input and the generic options.

`adapter.inputModalities` lists the input kinds of the selected model. It is `undefined` for a model that this package does not know. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

### Self-hosted gateway

To use your own deployment, set `baseURL`:

```typescript
import { createLLMGatewayText } from "@tanstack/ai-llmgateway";

const adapter = createLLMGatewayText("gpt-5.6-terra", process.env.LLM_GATEWAY_API_KEY!, {
  baseURL: "https://api.llmgateway.io/v1", // the hosted default. Set your own URL here.
});
```

The adapter works the same against a self-hosted gateway.

Need a header on each request, or a log of each model call? This adapter supports [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

### API reference

| Factories | Creates |
| --- | --- |
| `llmGatewayText(model, config?)` / `createLLMGatewayText(model, apiKey, config?)` | Chat adapter |
| `llmGatewaySummarize(model, config?)` / `createLLMGatewaySummarize(model, apiKey, config?)` | Summarization adapter |

The short factory reads `LLM_GATEWAY_API_KEY`. The `create*` factory takes an explicit API key.
