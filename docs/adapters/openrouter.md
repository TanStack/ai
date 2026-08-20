---
title: OpenRouter Adapter
id: openrouter-adapter
description: "Access 300+ LLMs from OpenAI, Anthropic, Google, Meta, Mistral, and more through a single API with OpenRouter in TanStack AI."
keywords:
  - tanstack ai
  - openrouter
  - multi-provider
  - unified api
  - llm gateway
  - 300 models
  - adapter
---

OpenRouter is TanStack AI's first official AI partner and the recommended starting point for most projects. It provides access to 300+ models from OpenAI, Anthropic, Google, Meta, Mistral, and many more — all through a single API key and unified interface.

## Installation

```bash
npm install @tanstack/ai-openrouter
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("openai/gpt-5"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createOpenRouterText } from "@tanstack/ai-openrouter";

const adapter = createOpenRouterText(
  "openai/gpt-5",
  process.env.OPENROUTER_API_KEY!,
  {
    serverURL: "https://openrouter.ai/api/v1", // Optional
    httpReferer: "https://your-app.com", // Optional, for rankings
    appTitle: "Your App Name", // Optional, for rankings
  },
);
```

## Available Models

OpenRouter provides access to 300+ models from various providers. Models use the format `provider/model-name`:

```text
model: "openai/gpt-5.1"
model: "anthropic/claude-sonnet-4.5"
model: "google/gemini-3.1-pro-preview"
model: "meta-llama/llama-4-maverick"
model: "deepseek/deepseek-v3.2"
```

See the full list at [openrouter.ai/models](https://openrouter.ai/models).

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openRouterText("openai/gpt-5"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({
    location: z.string(),
  }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny" };
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openRouterText("openai/gpt-5"),
    messages,
    tools: [getWeather],
  });

  return toServerSentEventsResponse(stream);
}
```

## Tools and structured output together

You can pass both `tools` and `outputSchema` on one `chat()` call. For some
upstream models OpenRouter can return the typed object in that same streaming
request, so the engine does not make a second finalization call.

That happens only when **every** model that can receive the request is in
`OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS`. The set is generated from
OpenRouter's catalog on every model sync: every chat model whose
`supported_parameters` include `structured_outputs`, `tools` and `tool_choice`
(Claude 4.5+, Gemini 2.5+, GPT-4o+, Grok 4, DeepSeek V3+, Llama 3.1+, and so
on). Models OpenRouter does not flag, such as `anthropic/claude-opus-4.1`, stay
on the legacy two-call path.

If any fallback in `modelOptions.models` is outside that set, OpenRouter keeps
the two-call path. Routing suffixes such as `:nitro` do not change the gate.

Import the set from `@tanstack/ai-openrouter/model-meta` if you need to check a
model before you send:

```typescript
import { OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS } from "@tanstack/ai-openrouter/model-meta";

OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS.has("openai/gpt-5.5");
```

Chat Completions (`openRouterText`) and Responses (`openRouterResponsesText`)
both attach the schema on this path. The client does not change: `useChat({
outputSchema })` still reads `partial` and `final`.

Server (Chat Completions):

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { z } from "zod";

const getWeather = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({ location: z.string() }),
}).server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny", location };
});

const AnswerSchema = z.object({
  summary: z.string(),
  location: z.string(),
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openRouterText("openai/gpt-5.5"),
    messages,
    tools: [getWeather],
    outputSchema: AnswerSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

Server (Responses). Same `tools` and `outputSchema` as the Chat Completions
example, with `openRouterResponsesText`:

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { openRouterResponsesText } from "@tanstack/ai-openrouter";
import { z } from "zod";

const getWeather = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({ location: z.string() }),
}).server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny", location };
});

const AnswerSchema = z.object({
  summary: z.string(),
  location: z.string(),
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openRouterResponsesText("openai/gpt-5.5"),
    messages,
    tools: [getWeather],
    outputSchema: AnswerSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

Client:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";

const AnswerSchema = z.object({
  summary: z.string(),
  location: z.string(),
});

const { sendMessage, partial, final } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  outputSchema: AnswerSchema,
});
```

See [Structured Outputs with tools](../structured-outputs/with-tools) for the
event order, and [Middleware](../advanced/middleware) for how
`structuredOutput` phase behaves on this path.

To try this in a browser, run `examples/ts-react-chat` and open
`/generations/openrouter-combined`. The page shows the tool call, the typed
object, and the adapter call counts. `structuredOutputStream` must stay at 0.

## Environment Variables

Set your API key in environment variables:

```bash
OPENROUTER_API_KEY=sk-or-...
```

## Model Routing

OpenRouter can automatically route requests to the best available provider:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openRouterText("openrouter/auto"),
    messages,
    modelOptions: {
      models: [
        "openai/gpt-5.5",
        "anthropic/claude-sonnet-4.5",
        "google/gemini-3.1-pro-preview",
      ],
    },
  });

  return toServerSentEventsResponse(stream);
}
```

## Model Options

OpenRouter supports various provider-specific options. Sampling parameters live here too — `temperature`, `topP`, and `maxCompletionTokens` (OpenRouter's token-limit key for the chat adapter) — rather than as root-level props on `chat()`:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openRouterText("anthropic/claude-sonnet-4.5"),
    messages,
    modelOptions: {
      temperature: 0.7,
      topP: 0.9,
      maxCompletionTokens: 1024,
    },
  });

  return toServerSentEventsResponse(stream);
}
```

> If you previously passed `temperature` / `topP` / `maxTokens` at the root of `chat()`, see [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

## Chat Completions vs Responses (beta)

OpenRouter exposes two OpenAI-compatible wire formats, and the adapter
package ships one of each:

| Adapter                   | Endpoint               | Status | When to use                                                                               |
| ------------------------- | ---------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `openRouterText`          | `/v1/chat/completions` | Stable | Default for almost everything. Broadest model + tool support.                             |
| `openRouterResponsesText` | `/v1/responses`        | Beta   | OpenAI Responses-shaped request/response; richer multi-turn state on OpenAI-style models. |

Both adapters route to any underlying model OpenRouter supports
(`anthropic/...`, `google/...`, `meta-llama/...`, etc.) — the wire format
describes how your client talks to OpenRouter, not which provider answers.
`/v1/responses` is OpenAI's newer API surface; OpenRouter implements it so
clients that prefer that wire format can use it across the same 300+
model catalogue.

```typescript
import { chat } from "@tanstack/ai";
import { openRouterResponsesText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterResponsesText("anthropic/claude-sonnet-4.5"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

Caveats while the Responses adapter is in beta:

- Function tools are supported; OpenRouter's branded server-tools (web
  search, file search, …) are not yet wired through this path — use
  `openRouterText` if you need those.
- If in doubt, prefer `openRouterText`. The Chat Completions endpoint has
  broader provider coverage and feature parity today.

## Cost Tracking

OpenRouter reports the actual cost of each request inline on the streamed
response. When present, the adapter forwards it on the terminal `RUN_FINISHED`
event under `usage.cost`, with OpenRouter's per-request breakdown under
`usage.costDetails`. This is the cost OpenRouter itself reports for the
request — it is **not** computed locally from token counts, so it already
accounts for routing, fallback providers, BYOK, and cached-token pricing. See
OpenRouter's [Usage Accounting](https://openrouter.ai/docs/use-cases/usage-accounting)
docs for the meaning and units of these fields.

```typescript ignore
import { chat, type RunFinishedEvent, type StreamChunk } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

function isRunFinished(chunk: StreamChunk): chunk is RunFinishedEvent {
  return "finishReason" in chunk;
}

for await (const chunk of chat({
  adapter: openRouterText("openai/gpt-5"),
  messages: [{ role: "user", content: "Hello!" }],
})) {
  if (isRunFinished(chunk)) {
    console.log("cost:", chunk.usage?.cost);
    console.log("breakdown:", chunk.usage?.costDetails);
  }
}
```

The same `usage` (including `cost` / `costDetails`) is passed to middleware via
the `onUsage` and `onFinish` hooks. When OpenRouter does not report a cost, the
fields are simply absent and the stream completes normally. Both
`openRouterText` and `openRouterResponsesText` populate cost when OpenRouter
returns it.

## Reranking

OpenRouter exposes rerank models through its unified `/v1/rerank` endpoint
(served via the `@openrouter/sdk` SDK). Any rerank model OpenRouter offers works
by passing its slug — for example `cohere/rerank-v3.5`, `cohere/rerank-4-fast`,
`cohere/rerank-4-pro`, or `nvidia/llama-nemotron-rerank-vl-1b-v2`. Use
`openRouterRerank` with the `rerank()` activity to reorder candidate documents
by relevance to a query:

```typescript
import { rerank } from "@tanstack/ai";
import { openRouterRerank } from "@tanstack/ai-openrouter";

const { rerankedDocuments } = await rerank({
  adapter: openRouterRerank("cohere/rerank-v3.5"),
  query: "talk about rain",
  documents: ["sunny day at the beach", "rainy afternoon in the city"],
  topN: 2,
});

console.log(rerankedDocuments[0]); // 'rainy afternoon in the city'
```

`openRouterRerank` reads `OPENROUTER_API_KEY` from the environment; pass a key
explicitly with `createOpenRouterRerank("cohere/rerank-v3.5", "sk-or-...")`. The
optional `httpReferer` / `appTitle` config fields are forwarded as OpenRouter
attribution headers, just like the chat adapter.

See the [Reranking guide](../rerank/rerank) for object documents, RAG
pipelines, options, and the result shape.

## Image Generation

`openRouterImage` routes image generation through OpenRouter's
chat-completions surface (`modalities: ['image']`). Multimodal prompts are
supported — text and image parts are forwarded in order for
image-conditioned generation:

```typescript
import { generateImage } from "@tanstack/ai";
import { openRouterImage } from "@tanstack/ai-openrouter";

const result = await generateImage({
  adapter: openRouterImage("google/gemini-2.5-flash-image"),
  prompt: "A watercolor lighthouse at dusk",
  size: "1344x768", // mapped to image_config.aspect_ratio ('16:9')
  modelOptions: {
    image_size: "2K", // resolution (Gemini models)
    strength: 0.35, // image-to-image influence, i2i-capable models only
  },
});
```

Notes:

- The pathway returns **exactly one image per request** — `numberOfImages > 1`
  throws instead of silently under-delivering. Make multiple requests if you
  need multiple candidates.
- `size` must be one of the ten supported `WIDTHxHEIGHT` values (it is
  converted to `image_config.aspect_ratio`); anything else throws with the
  supported list.

## Video Generation (Experimental)

`openRouterVideo` targets OpenRouter's dedicated **async video API**
(`POST /api/v1/videos`) — Seedance, Veo 3.1, Wan, Kling, and Sora 2 Pro
through your one OpenRouter key. It follows the jobs/polling architecture
shared by all TanStack AI video adapters:

```typescript
// Server: create the job, then poll
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { openRouterVideo } from "@tanstack/ai-openrouter";

const adapter = openRouterVideo("bytedance/seedance-2.0");

const { jobId } = await generateVideo({
  adapter,
  prompt: [
    { type: "text", content: "Animate this product shot, slow push-in" },
    {
      type: "image",
      source: { type: "url", value: "https://your-cdn.com/product.png" },
      metadata: { role: "start_frame" },
    },
  ],
  size: "1280x720",
  // `duration` is typed per model from the published metadata; coerce raw
  // seconds with adapter.snapDuration() or enumerate via adapter.availableDurations().
  duration: 8,
});

let status = await getVideoJobStatus({ adapter, jobId });
while (status.status !== "completed" && status.status !== "failed") {
  await new Promise((r) => setTimeout(r, 5000));
  status = await getVideoJobStatus({ adapter, jobId });
}
// status.url is a data: URL (OpenRouter download URLs require the API key,
// so the adapter downloads server-side); status.usage?.cost is the real
// billed cost reported by the gateway.
```

```tsx
// Client: track the job with the useGenerateVideo hook
import { useGenerateVideo, fetchServerSentEvents } from "@tanstack/ai-react";

const { generate, result, videoStatus, isLoading } = useGenerateVideo({
  connection: fetchServerSentEvents("/api/generate/video"),
});
// result?.url renders directly: <video src={result.url} controls />
```

Sizes, durations, and per-model options (`resolution`, `aspectRatio`,
`generateAudio`, `seed`, …) are typed and validated per model from
OpenRouter's video model metadata. See
[Video Generation](../media/video-generation.md) for the full lifecycle,
streaming mode, and the image-to-video role-mapping table.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about tools
- [Reranking](../rerank/rerank) - Reorder documents by relevance

## Provider Tools

> **Migrated from `createWebSearchTool`?** This factory was renamed to
> `webSearchTool` and moved to the `/tools` subpath in this release.
> See [Migration Guide §6](../migration/migration.md#6-provider-tools-moved-to-tools-subpath)
> for the exact before/after.

OpenRouter's gateway exposes web search via a plugin that works across
any proxied chat model. Import it from `@tanstack/ai-openrouter/tools`.

> For the full concept, a comparison matrix, and type-gating details, see
> [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

Adds web search capability to any OpenRouter-proxied chat model. The factory
accepts OpenRouter's `WebSearchConfig` directly — pick the `engine`
(`auto`, `native`, `exa`, `firecrawl`, or `parallel`), cap results with
`maxResults` / `maxTotalResults`, restrict which sites can appear in results
with `allowedDomains` / `excludedDomains`, and optionally pass
`searchContextSize` or `userLocation` for finer control.

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { webSearchTool } from "@tanstack/ai-openrouter/tools";

const stream = chat({
  adapter: openRouterText("openai/gpt-5"),
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

**Supported models:** all OpenRouter chat models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `webFetchTool`

Lets any OpenRouter-proxied chat model fetch the full contents of a URL the
model chooses, instead of running a search. The factory accepts OpenRouter's
`WebFetchServerToolConfig` directly — pick the fetch `engine` (`auto` — the
default, `native`, `openrouter`, `exa`, or `firecrawl`), cap how much page
content the model receives with `maxContentTokens`, cap how many fetches the
model can make per request with `maxUses`, and restrict which URLs the model
can fetch with `allowedDomains` / `blockedDomains`.

> The `native` engine routes to the underlying provider's own fetch (for
> example, Anthropic's `web_fetch` on Claude models). Native fetch
> capabilities vary, so `allowedDomains` and `blockedDomains` may be
> ignored. Use `openrouter`, `exa`, or `firecrawl` if you need consistent
> behaviour across models.

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { webFetchTool } from "@tanstack/ai-openrouter/tools";

const stream = chat({
  adapter: openRouterText("openai/gpt-5"),
  messages: [
    { role: "user", content: "Summarize https://example.com/article" },
  ],
  tools: [
    webFetchTool({
      engine: "openrouter",
      maxContentTokens: 4000,
      allowedDomains: ["example.com"],
    }),
  ],
});
```

**Supported models:** all OpenRouter chat models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).
