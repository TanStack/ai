---
title: OpenAI-Compatible Adapter
id: openai-compatible-adapter
description: "Use any OpenAI-compatible provider in TanStack AI with one generic adapter: DeepSeek, Moonshot/Kimi, Together, Fireworks, Cerebras, Qwen, Perplexity, local servers, and more."
keywords:
  - tanstack ai
  - openai compatible
  - deepseek
  - moonshot
  - kimi
  - together
  - fireworks
  - cerebras
  - qwen
  - perplexity
  - lm studio
  - vllm
  - litellm
  - adapter
---

`openaiCompatible` calls any server that speaks `/chat/completions` and has no `@tanstack/ai-*` package. Set `baseURL` and the model list, then call `chat()`.

`openaiCompatible` is one generic adapter for all of them. Point it at the `baseURL`, list your models, and you get the same type-safe `chat()` as with the other adapters.

If a dedicated adapter exists, use it, because it has curated metadata for each model:

- [OpenAI](./openai), [Grok](./grok), [Groq](./groq), and [OpenRouter](./openrouter).
- Vercel AI Gateway: `vercelGatewayText` from `@tanstack/ai-vercel-gateway`. See [Vercel AI Gateway](./vercel-gateway.md).
- Lovable AI Gateway: `lovableText` (plus image, video, embeddings, and speech factories) from `@tanstack/ai-lovable`. See [Lovable AI Gateway](./lovable.md).

Perplexity Sonar chat uses this adapter. [`@tanstack/ai-perplexity`](./perplexity.md) is for search and grounding only. To send the `X-Pplx-Integration` attribution header of Perplexity, pass `defaultHeaders: getPerplexityIntegrationHeaders()` from that package.

## 1. Install

The adapter is in `@tanstack/ai-openai`, under the `/compatible` subpath:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-openai
vue: @tanstack/ai-openai
solid: @tanstack/ai-openai
svelte: @tanstack/ai-openai
preact: @tanstack/ai-openai
angular: @tanstack/ai-openai
vanilla: @tanstack/ai-openai
octane: @tanstack/ai-openai

<!-- ::end:tabs -->

## 2. Set the API key

Put the key of your provider in the environment of your server, with the variable name that you like:

```bash
DEEPSEEK_API_KEY=sk-...
```

The adapter reads no environment variable itself. You pass the key as `apiKey` in the next step.

## 3. Stream a chat from the server

Configure the provider one time with `openaiCompatible({ baseURL, apiKey, models })`. Then pick a model for each call:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const deepseek = openaiCompatible({
  name: "deepseek", // optional label for devtools and errors (default: "openai-compatible")
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: ["deepseek-chat", "deepseek-reasoner"],
});

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: deepseek("deepseek-chat"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

The model name is a type-safe union of the models that you declared. `deepseek("deepseek-reasoner")` is valid. `deepseek("gpt-4o")` is a type error.

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

You now have a streaming chat with any OpenAI-compatible provider. [Tools](../tools/tools) work the same as with every adapter, on models that support function calling.

## One model only

For a single model, skip the provider factory and build the adapter inline with `openaiCompatibleText`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";

const stream = chat({
  adapter: openaiCompatibleText("deepseek-chat", {
    baseURL: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY!,
  }),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
});
```

## Local and self-hosted servers

Point the adapter at any local OpenAI-compatible server. The API key is usually a placeholder:

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

// LM Studio
const lmstudio = openaiCompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
  apiKey: "lm-studio",
  models: ["local-model"],
});

// vLLM
const vllm = openaiCompatible({
  name: "vllm",
  baseURL: "http://localhost:8000/v1",
  apiKey: "not-needed",
  models: ["meta-llama/Llama-3.3-70B-Instruct"],
});

// The OpenAI-compatible endpoint of Ollama
const ollama = openaiCompatible({
  name: "ollama",
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
  models: ["llama3.3"],
});
```

Ollama also has a dedicated adapter, [`@tanstack/ai-ollama`](./ollama), for its native API. If you want the OpenAI-compatible surface of Ollama, use `openaiCompatible`.

## LiteLLM proxy

[LiteLLM](https://github.com/BerriAI/litellm) is a self-hosted gateway. It gives one OpenAI Chat Completions endpoint for 100+ providers (OpenAI, Anthropic, Google, Azure, AWS Bedrock, Mistral, Groq, and more). Point `openaiCompatible` at your proxy (default `http://localhost:4000/v1`). Pick a provider with the `provider/model` names of LiteLLM:

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const litellm = openaiCompatible({
  name: "litellm",
  baseURL: "http://localhost:4000/v1", // your LiteLLM proxy
  apiKey: process.env.LITELLM_API_KEY!, // a virtual key issued by the proxy
  models: [
    "anthropic/claude-sonnet-5",
    "openai/gpt-5.5",
    "gemini/gemini-3.5-flash",
  ],
});
```

- `litellm("anthropic/claude-sonnet-5")` goes to Anthropic, and `litellm("openai/gpt-5.5")` goes to OpenAI, through the one proxy.
- Declare only the routes that you configured on the proxy. For exact capabilities of each route, use `createModel`. See [Declaring models](#declaring-models).
- The proxy holds the real credentials of each provider. The `apiKey` here is the virtual or master key of the proxy.

## Models and options

### Declaring models

The `models` array takes two forms. You can mix them:

- **A string** gets optimistic defaults: `text` and `image` input, with `streaming`, `function_calling`, and `structured_outputs`. Good for mainstream chat models.
- **A `createModel(name, capabilities)` definition** declares the exact capabilities of a model, so the types match the model. An example is a reasoning model with no image input.

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { createModel } from "@tanstack/ai";

const provider = openaiCompatible({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: [
    "deepseek-chat", // string: optimistic defaults
    createModel("deepseek-reasoner", {
      input: ["text"], // text only
      features: ["reasoning", "structured_outputs"],
    }),
  ],
});
```

The types enforce the `input` modalities, the `modelOptions`, and the provider `tools` you declare. They do not read `features`. Function tools and structured output are always allowed on this path. If a provider rejects one of them at run time (for example, tools on a model without tool support), do not pass it for that model.

### Providers

Any provider with the OpenAI Chat Completions API works. Common ones are below. **Check the `baseURL` and the model ids in the current docs of each provider**, because they change.

| Provider | `baseURL` | Example model |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-reasoner` |
| Moonshot / Kimi | `https://api.moonshot.ai/v1` | `kimi-k2-0711-preview` |
| Alibaba Qwen (DashScope, intl) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-max`, `qwen-plus` |
| Alibaba Qwen (DashScope, China) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` |
| Together AI | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` |
| Cerebras | `https://api.cerebras.ai/v1` | `llama-3.3-70b` |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | `meta-llama/Llama-3.3-70B-Instruct` |
| Perplexity | `https://api.perplexity.ai` | `sonar`, `sonar-pro` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| Nebius | `https://api.studio.nebius.ai/v1` | `meta-llama/Llama-3.3-70B-Instruct` |
| Z.AI (GLM) | `https://api.z.ai/api/paas/v4` | `glm-4.6` |
| Baseten | `https://inference.baseten.co/v1` | depends on the model |
| Hugging Face (router) | `https://router.huggingface.co/v1` | `meta-llama/Llama-3.3-70B-Instruct` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.3-70b-instruct` |
| Kilo Gateway | `https://api.kilo.ai/api/gateway` | `anthropic/claude-opus-5.5` |
| ZenMux | `https://zenmux.ai/api/v1` | `openai/gpt-5.5` |
| Poe | `https://api.poe.com/v1` | `openai/gpt-5.5` |
| DigitalOcean | `https://inference.do-ai.run/v1` | `openai-gpt-5.5` |
| Modal | `https://inference.us-west.modal.direct/v1` | `moonshotai/Kimi-K3` |
| Snowflake Cortex | `https://<account>.snowflakecomputing.com/api/v2/cortex/v1` | `claude-opus-5` |

- Some providers sign the user in with OAuth, not with an API key. For Poe, DigitalOcean, and Snowflake Cortex, pass the access token from your sign-in code as `apiKey`.
- On Chat Completions, `RUN_FINISHED.usage` carries the prompt cache counts that the provider reports. Cache reads go to `promptTokensDetails.cachedTokens`, and cache writes go to `promptTokensDetails.cacheWriteTokens`. Moonshot / Kimi reports both.

## Advanced

These topics are on [OpenAI-Compatible: Advanced](./openai-compatible-advanced):

- Configuration: headers, query parameters, and `wrapFetch`.
- The Responses API (`api: "responses"`).
- Azure OpenAI.
- GitHub Copilot: let users pay with their Copilot plan.
- ChatGPT plan: let users pay with their ChatGPT plan.

To add custom models to any adapter, see [Extending Adapters](../advanced/extend-adapter).
