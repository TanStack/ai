---
title: OpenRouter Adapter
id: openrouter-adapter
description: "Use 300+ models from OpenAI, Anthropic, Google, Meta, Mistral, and more in TanStack AI with one OpenRouter API key."
keywords:
  - tanstack ai
  - openrouter
  - multi-provider
  - unified api
  - llm gateway
  - 300 models
  - adapter
  - evaluate
  - jev
---

OpenRouter gives you 300+ models from OpenAI, Anthropic, Google, Meta, Mistral, and more, with one API key. It is the first official AI partner of TanStack AI, and a good place to start for most projects.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-openrouter
vue: @tanstack/ai-openrouter
solid: @tanstack/ai-openrouter
svelte: @tanstack/ai-openrouter
preact: @tanstack/ai-openrouter
angular: @tanstack/ai-openrouter
vanilla: @tanstack/ai-openrouter
octane: @tanstack/ai-openrouter

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
OPENROUTER_API_KEY=sk-or-...
```

`openRouterText` and the other short factories read `OPENROUTER_API_KEY`. To pass the key in code, use the `create*` factory of the same adapter:

```typescript
import { createOpenRouterText } from "@tanstack/ai-openrouter";

const adapter = createOpenRouterText("openai/gpt-6.1-sol", process.env.OPENROUTER_API_KEY!);
```

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openRouterText("openai/gpt-6.1-sol"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

To use a different model, change the id. Ids have the shape `provider/model-name`, for example `anthropic/claude-sonnet-5.5` or `google/gemini-3.1-pro-preview`.

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

You now have a streaming chat on OpenRouter. [Tools](../tools/tools) and [Structured Outputs](../structured-outputs/overview) work the same as with every adapter.

## Model routing

A model can be down, or slow on one provider. Give OpenRouter a fallback list in `models`. When the primary model is not available, OpenRouter tries the models in order:

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("openrouter/auto"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    models: [
      "openai/gpt-6.1-sol",
      "anthropic/claude-sonnet-5.5",
      "google/gemini-3.1-pro-preview",
    ],
  },
});
```

To pick which upstream providers serve a model, set `modelOptions.provider`:

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("meta-llama/llama-4-maverick"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    provider: {
      order: ["groq", "together"], // provider slugs, in priority order
      allowFallbacks: false, // fail instead of routing elsewhere
    },
  },
});
```

For all the `provider` fields, model variants such as `:free`, and plugins, see [OpenRouter: Advanced](./openrouter-advanced#provider-preferences).

## Provider tools

OpenRouter runs web search and web fetch for any chat model. Import the tools from `@tanstack/ai-openrouter/tools`:

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { webSearchTool } from "@tanstack/ai-openrouter/tools";

const stream = chat({
  adapter: openRouterText("openai/gpt-6.1-sol"),
  messages: [{ role: "user", content: "What's new in AI this week?" }],
  tools: [
    webSearchTool({
      engine: "exa",
      maxResults: 5,
      allowedDomains: ["arxiv.org", "openai.com"],
    }),
  ],
});
```

- `webSearchTool`: search the web.
- `webFetchTool`: read the full page at a URL that the model picks.

Both work on all OpenRouter chat models. For every option of each tool, see [OpenRouter: Advanced](./openrouter-advanced#provider-tools). For how provider tools compare across adapters, see [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

## Tools and structured output together

You can pass `tools` and `outputSchema` on one `chat()` call. On some models, OpenRouter returns the typed object in the same streaming request. Then no second call is necessary.

This happens only when every model that can get the request is in `OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS`. To check a model before you send:

```typescript
import { OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS } from "@tanstack/ai-openrouter/model-meta";

console.log(OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS.has("openai/gpt-6.1-sol")); // true
```

For the full server and client code and the rules of the set, see [OpenRouter: Advanced](./openrouter-advanced#tools-and-structured-output-in-one-call).

## Images

```typescript
import { generateImage } from "@tanstack/ai";
import { openRouterImage } from "@tanstack/ai-openrouter";

const result = await generateImage({
  adapter: openRouterImage("google/gemini-nano-banana-2.1"),
  prompt: "A watercolor lighthouse at dusk",
  size: "1344x768", // sent as image_config.aspect_ratio ("16:9")
  modelOptions: {
    image_size: "2K", // resolution (Gemini models)
  },
});

console.log(result.images);
```

- You get one image for each request. `numberOfImages` more than 1 throws an error.
- `size` takes one of ten `WIDTHxHEIGHT` values. Other values throw an error that lists the valid sizes.
- The prompt can mix text and image parts, for image-to-image work. `modelOptions.strength` sets how much the input image controls the result, on models that support it.

For a React and TanStack Start walkthrough with `useGenerateImage`, see [Generate Image](../tutorials/generate-image). See also [Image Generation](../media/image-generation).

## Video

`openRouterVideo` makes videos with Seedance, Veo 3.1, Wan, Kling, and more, through the async video API of OpenRouter (`POST /api/v1/videos`). Video generation is experimental. For the full server and client code, see [OpenRouter: Advanced](./openrouter-advanced#video-generation).

## Reranking

`openRouterRerank` puts documents in order of how well they match a query:

```typescript
import { rerank } from "@tanstack/ai";
import { openRouterRerank } from "@tanstack/ai-openrouter";

const { rerankedDocuments } = await rerank({
  adapter: openRouterRerank("cohere/rerank-4-pro"),
  query: "talk about rain",
  documents: ["sunny day at the beach", "rainy afternoon in the city"],
  topN: 2,
});

console.log(rerankedDocuments[0]); // "rainy afternoon in the city"
```

Any rerank model on OpenRouter works. Known ids: `cohere/rerank-v3.5`, `cohere/rerank-4-fast`, `cohere/rerank-4-pro`, `nvidia/llama-nemotron-rerank-vl-1b-v2`. See the [Reranking guide](../rerank/rerank).

## Evaluate

Sometimes you need an answer that your code can branch on, not chat text. Use `openRouterDecider` with `decide()` to ask typed questions about one shared `state`. The adapter calls TypeSafe Jev through `POST /api/alpha/decisions`:

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { openRouterDecider } from "@tanstack/ai-openrouter";

const ticket = {
  subject: "Charged twice for the same invoice",
  body: "Please refund the extra payment.",
};

const result = await decide({
  adapter: openRouterDecider("~typesafe/jev-latest"),
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

console.log(result.queue.value);
console.log(result.queue.probability);
console.log(result.queue.confidence);
console.log(result.meta.usage);
```

- `result.meta.usage.cost`: the cost of the request, to bill per request.
- `result.meta.id`: the id to look the request up later with `GET /api/v1/generation?id=`.
- `result.meta.provider`: the upstream provider that served the request.

Known ids: `~typesafe/jev-latest`, `typesafe/jev-1.13`, `typesafe/jev-1.13.0`. See the [Evaluate guide](../evaluate/evaluate).

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { openRouterSummarize } from "@tanstack/ai-openrouter";

const result = await summarize({
  adapter: openRouterSummarize("google/gemini-3.8-flash"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Cost tracking

OpenRouter reports the real cost of each request. The adapter puts it on the last `RUN_FINISHED` event as `usage.cost`, with the breakdown in `usage.costDetails`. This cost includes routing, fallback providers, BYOK, and cached-token prices. See [Cost tracking](./openrouter-advanced#cost-tracking) for a sample.

## Sign in with OpenRouter (BYOK)

Your users can sign in with their own OpenRouter account. Then the requests use their key and their credit. The helpers are in `@tanstack/ai-openrouter/pkce`. For the browser and the CLI flows, see [OpenRouter: Advanced](./openrouter-advanced#sign-in-with-openrouter-byok).

## Models and options

### Model options

Provider options go in `modelOptions`. This includes sampling options such as `temperature` and `maxCompletionTokens` (the token limit of the chat adapter). The type only allows the options that the selected model supports. For example, Claude Sonnet 5.5 does not take `topP`, so `topP` is a type error for that model:

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("anthropic/claude-sonnet-5.5"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    temperature: 0.7,
    maxCompletionTokens: 1024,
  },
});
```

The option names are the camelCase names of the OpenRouter SDK. Sampling options do not go at the root of `chat()`. See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

Set `reasoning` on `chat()`. OpenRouter gets it as `reasoning.effort`:

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("anthropic/claude-opus-5.5"),
  messages: [{ role: "user", content: "Hello!" }],
  reasoning: "high",
});
```

- `off` sends `effort: "none"`.
- `openRouterText` takes no `budgetTokens`. `openRouterResponsesText` sends `budgetTokens` as `reasoning.maxTokens`, and adds `summary: "auto"` so that the thinking text streams.
- The types know the levels of each model. Your editor shows them when you type `reasoning`.

See [Reasoning](../chat/reasoning).

### Models

Model ids have the shape `provider/model-name`:

```text
openai/gpt-6.1-sol
anthropic/claude-sonnet-5.5
google/gemini-3.1-pro-preview
meta-llama/llama-4-maverick
deepseek/deepseek-v4-pro
```

See the full list at [openrouter.ai/models](https://openrouter.ai/models). The package exports the known ids:

- `@tanstack/ai-openrouter/model-meta`: `OPENROUTER_CHAT_MODELS`, `OPENROUTER_IMAGE_MODELS`, `OPENROUTER_VIDEO_MODELS`.
- `@tanstack/ai-openrouter`: `OPENROUTER_RERANK_MODELS`, `OPENROUTER_EVALUATE_MODELS`.

`adapter.inputModalities` lists the input kinds of the selected model. It is `undefined` for a model that this package does not know. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

These topics are on [OpenRouter: Advanced](./openrouter-advanced):

- Configuration: base URL, app attribution headers, and `wrapFetch`.
- Retries for rate limits, and for an error in the stream.
- The Responses adapter (`openRouterResponsesText`, beta).
- Provider preferences, model variants, plugins, and session metadata.
- Prompt caching and JSON mode.
- Tools and structured output in one call, with the full code.
- `webFetchTool`, cost tracking, video generation, and Sign in with OpenRouter.
- The API reference.
