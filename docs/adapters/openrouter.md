---
title: OpenRouter Adapter
id: openrouter-adapter
description: "300+ models through one OpenRouter key via @tanstack/ai-openrouter."
keywords:
  - tanstack ai
  - openrouter
  - multi-provider
  - unified api
  - llm gateway
  - 300 models
  - adapter
---

If you need many providers via one key → install, set `OPENROUTER_API_KEY`, call `openRouterText("provider/model")`.

Models: [openrouter.ai/models](https://openrouter.ai/models) (`openai/gpt-5.1`, `anthropic/claude-sonnet-4.5`, …).

## Install

```bash
npm install @tanstack/ai-openrouter
```

```bash
OPENROUTER_API_KEY=sk-or-...
```

## Do this

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("openai/gpt-5"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Explicit key / rankings headers

```typescript
import { createOpenRouterText } from "@tanstack/ai-openrouter";

const adapter = createOpenRouterText(
  "openai/gpt-5",
  process.env.OPENROUTER_API_KEY!,
  {
    serverURL: "https://openrouter.ai/api/v1",
    httpReferer: "https://your-app.com",
    appTitle: "Your App Name",
  },
);
```

### Server + tools

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

## Model routing

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

## Model options

Token limit key: `maxCompletionTokens`.

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

> Root-level sampling migration: [modelOptions](../migration/sampling-options-to-model-options).

## Chat Completions vs Responses (beta)

| Adapter | Endpoint | Status | When |
| --- | --- | --- | --- |
| `openRouterText` | `/v1/chat/completions` | Stable | Default — broadest support |
| `openRouterResponsesText` | `/v1/responses` | Beta | Responses wire format |

Wire format is client↔OpenRouter, not which underlying model answers.

```typescript
import { chat } from "@tanstack/ai";
import { openRouterResponsesText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterResponsesText("anthropic/claude-sonnet-4.5"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

**Beta caveats:** function tools OK; branded server-tools (web search, file search) not on Responses path yet — use `openRouterText`.

## Cost tracking

OpenRouter cost on `RUN_FINISHED` → `usage.cost` / `usage.costDetails` (provider-reported, not local token math). Also on middleware `onUsage` / `onFinish`. Absent when OpenRouter omits it.

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

Docs: [Usage Accounting](https://openrouter.ai/docs/use-cases/usage-accounting).

## Provider tools

From `@tanstack/ai-openrouter/tools`.  
`createWebSearchTool` → `webSearchTool` on `/tools` ([migration](../migration/migration.md#6-provider-tools-moved-to-tools-subpath)).  
Matrix: [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

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

Engines: `auto`, `native`, `exa`, `firecrawl`, `parallel`.

### `webFetchTool`

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

Engines: `auto`, `native`, `openrouter`, `exa`, `firecrawl`. `native` may ignore domain filters.

## Next steps

- [Getting Started](../getting-started/quick-start)
- [Tools](../tools/tools)
