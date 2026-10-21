---
title: Anthropic
id: anthropic-adapter
order: 2
description: "Use Anthropic Claude models in TanStack AI with @tanstack/ai-anthropic: Claude Opus, Sonnet, Haiku, and Fable for chat, thinking, prompt caching, and tools."
keywords:
  - tanstack ai
  - anthropic
  - claude
  - claude fable 5
  - claude sonnet 5
  - claude opus
  - adapter
  - llm
---

Anthropic gives you the Claude models for chat, with thinking, automatic prompt caching, and tools that Anthropic runs for you.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-anthropic
vue: @tanstack/ai-anthropic
solid: @tanstack/ai-anthropic
svelte: @tanstack/ai-anthropic
preact: @tanstack/ai-anthropic
angular: @tanstack/ai-anthropic
vanilla: @tanstack/ai-anthropic
octane: @tanstack/ai-anthropic

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

`anthropicText`, `anthropicSummarize`, and `anthropicFiles` use the first of these variables that is set:

1. `ANTHROPIC_AUTH_TOKEN`: sent as a Bearer token. An `sk-ant-oat` token here turns on OAuth mode.
2. `ANTHROPIC_OAUTH_TOKEN`: sent as a Bearer token, in OAuth mode.
3. `ANTHROPIC_API_KEY`: sent as `x-api-key`.

If none of them is set, these factories throw. To pass the credential in code, use `createAnthropicChat`. The `create*` factories never read a credential from the environment:

```typescript
import { createAnthropicChat } from "@tanstack/ai-anthropic";

const adapter = createAnthropicChat("claude-sonnet-5-5", process.env.ANTHROPIC_API_KEY!);
```

Got a Bearer or OAuth token? See [Bearer and OAuth tokens](./anthropic-advanced#bearer-and-oauth-tokens).

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: anthropicText("claude-sonnet-5-5"),
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

You now have a streaming Claude chat. [Tools](../tools/tools) and [Structured Outputs](../structured-outputs/overview) work the same as with every adapter.

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { anthropicSummarize } from "@tanstack/ai-anthropic";

const result = await summarize({
  adapter: anthropicSummarize("claude-sonnet-4-6"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Files

`anthropicFiles` uploads media to the Anthropic Files API, so a message can point to the file. See [Files API](../advanced/files-api).

## No image generation

Anthropic does not make images. For images, use [OpenAI](./openai) or [Gemini](./gemini).

## Provider tools

Anthropic runs some tools itself, such as web search and a code sandbox. Import them from `@tanstack/ai-anthropic/tools` and add them to `tools`:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { webSearchTool } from "@tanstack/ai-anthropic/tools";

const stream = chat({
  adapter: anthropicText("claude-sonnet-5-5"),
  messages: [{ role: "user", content: "What's new in AI this week?" }],
  tools: [
    webSearchTool({
      name: "web_search",
      type: "web_search_20250305",
      max_uses: 2,
    }),
  ],
});
```

Tools that Anthropic runs:

- `webSearchTool`: search the web, with citations.
- `webFetchTool`: read one URL.
- `codeExecutionTool`: run code in a sandbox, also with hosted skills.
- `memoryTool`: keep facts across turns.

Tools that your app runs when Claude asks:

- `bashTool`: run shell commands.
- `textEditorTool`: view and change files.
- `computerUseTool`: control a virtual desktop.
- `customTool`: a tool with an inline schema.

Each tool, with a full sample, is on [Anthropic: Advanced](./anthropic-advanced#provider-tools). For which models take which tool, see [Provider Tools](../tools/provider-tools.md).

## Models and options

### Model options

Provider options go in `modelOptions`, with the Anthropic names:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-5-5"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    max_tokens: 4096,
    stop_sequences: ["END"],
  },
});
```

- The sampling options `temperature`, `top_p`, and `top_k` also go in `modelOptions`. Claude Sonnet 5, Claude Opus 4.7 and later, and the 5-generation models reject them. The types take them only on the models that accept them, for example `claude-sonnet-4-6`.
- When you do not set `max_tokens`, the adapter sends the full output limit of the model. See [The `max_tokens` default](./anthropic-advanced#max_tokens-default).
- Sampling options do not go at the root of `chat()`. See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

Want Claude to think harder, or not at all? Set `reasoning` on `chat()`. The adapter turns the level into the right thinking fields for the model.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-opus-5-5"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  reasoning: "xhigh",
});
```

What goes to Anthropic:

- `off` sends `thinking: { type: "disabled" }` on the models with `off` in the table below. On a model without `off`, such as `claude-fable-5`, the types reject it. At run time, it moves to the lowest level that the model has.
- Claude 4.6 and later get adaptive thinking and `output_config.effort`. With an `outputSchema`, the adapter adds `output_config.format` next to the effort.
- Budget models get `thinking: { type: "enabled", budget_tokens }`. The level picks the budget, or you set it with `budgetTokens`. If `max_tokens` is below the budget, the adapter raises it.
- `summary: false` sends `display: "omitted"`, so the thinking text does not stream.

The levels of each model:

| Model | Levels | `budgetTokens` |
| --- | --- | --- |
| `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-fable-5-1`, `claude-fable-5`, `claude-opus-5`, `claude-opus-4-8`, `claude-opus-4-7` | `low` to `max` | no |
| `claude-haiku-5-5`, `claude-sonnet-5` | `off`, `low` to `max` | no |
| `claude-opus-5-fast` | `off`, `low` to `max` | yes |
| `claude-opus-4-6`, `claude-sonnet-4-6` | `low`, `medium`, `high`, `max` | yes |
| `claude-opus-4-5` | `low`, `medium`, `high` | yes |
| `claude-haiku-4-5`, `claude-sonnet-4-5`, `claude-opus-4-1` | `off` to `high` | yes |

A budget model with `budgetTokens`:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-haiku-4-5"),
  messages: [{ role: "user", content: "Check this proof." }],
  reasoning: { level: "high", budgetTokens: 8000 },
});
```

Structured output forces a tool, and Claude cannot think while a tool is forced. So the structured output call sends no thinking. See [Reasoning](../chat/reasoning) for the levels and the nearest-level rule.

### Models

Newest first. The package exports the full list as `ANTHROPIC_MODELS`.

| Family | Models |
| --- | --- |
| Claude 5.5 | `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` |
| Claude 5 | `claude-fable-5-1`, `claude-fable-5`, `claude-opus-5`, `claude-opus-5-fast`, `claude-sonnet-5` |
| Claude 4 | `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-1` |

`adapter.inputModalities` lists the input kinds of the selected model. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

These topics are on [Anthropic: Advanced](./anthropic-advanced):

- Bearer and OAuth tokens, gateways, and your own Anthropic client.
- Claude on Vertex AI.
- The `max_tokens` default and prompt caching.
- Every provider tool, with a full sample.
- The API reference.

To call Claude through a GitHub Copilot plan, see [GitHub Copilot](./openai-compatible-advanced#claude-models).
