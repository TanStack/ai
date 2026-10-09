---
title: Mid-Conversation Changes
id: mid-conversation-changes
order: 18
description: "Add tools or system prompts during a conversation and keep the prompt cache. On GPT and Claude models with a mid-conversation channel, TanStack AI sends the change inside the conversation."
keywords:
  - tanstack ai
  - prompt caching
  - mid-conversation changes
  - dynamic tools
  - additional_tools
  - tool_addition
---

Your agent gets a new tool halfway through a chat. A middleware adds it, a [lazy tool](../tools/lazy-tool-discovery) is found, or the user turns on a feature. The tool list sits at the start of each request, so the new tool changes the start. The provider can no longer use its [prompt cache](./prompt-caching), and the next call costs more.

On some GPT and Claude models, TanStack AI sends the new tool inside the conversation instead. The start stays the same, and the cache keeps working. You change no code.

## Add a tool during a run

This route starts with one tool. A middleware adds a second tool after the first model call:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from "@tanstack/ai";
import type { ChatMiddleware } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const getWeather = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a city",
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => ({ city, temperature: 21 }));

const getForecast = toolDefinition({
  name: "get_forecast",
  description: "Get the forecast for a city",
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => ({ city, tomorrow: "sunny" }));

const addForecast: ChatMiddleware = {
  name: "add-forecast",
  onConfig: (ctx, config) => {
    if (ctx.phase !== "beforeModel" || ctx.iteration === 0) return;
    if (config.tools.some((tool) => tool.name === "get_forecast")) return;
    return { tools: [...config.tools, getForecast] };
  },
};

export async function POST(request: Request) {
  const { messages, threadId } = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-6-astra"),
    messages,
    threadId,
    tools: [getWeather],
    middleware: [addForecast],
  });
  return toServerSentEventsResponse(stream);
}
```

What the second model call sends:

| Model | `tools` | The new tool |
|---|---|---|
| `gpt-6-astra` | `get_weather` only | An `additional_tools` item after the tool result |
| `claude-opus-5-5` | `get_weather`, a placeholder tool, then `get_forecast` with `defer_loading: true` | A `system` message with a `tool_addition` block after the tool result |
| A model with no channel, such as `gpt-6.1-sol` | `get_weather` and `get_forecast` | Nothing extra |

A system prompt that you add at the end of the list works the same way. It goes into the conversation as a `developer` message (GPT) or a `system` message (Claude).

## Check your model

| Adapter | Models |
|---|---|
| `openaiText` | `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol` |
| `anthropicText` | `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-fable-5`, `claude-fable-5-1` |

Every other model and adapter sends the full lists on each call.

To check in code, read `midConversationChannels` on the adapter:

```typescript
import { openaiText } from "@tanstack/ai-openai";

const adapter = openaiText("gpt-6-astra");
console.log(adapter.midConversationChannels); // { tools: true, systemPrompts: true }
```

It is `undefined` when the model has no channel, or when the channels are off.

## Turn it on or off

The channels are on by default only when the adapter talks to the provider's own API. A gateway or a proxy can drop the extra fields, so the channels are off with:

- a custom `baseURL` or a custom `fetch`,
- a proxy URL in `OPENAI_BASE_URL` or `ANTHROPIC_BASE_URL`,
- an Anthropic adapter on your own client (`createAnthropicChatWithClient`, `anthropicVertexText`).

Set `midConversationChannels` in the adapter config to choose:

```typescript
import { anthropicText } from "@tanstack/ai-anthropic";
import { openaiText } from "@tanstack/ai-openai";

// Send the full lists on every call.
export const fullLists = openaiText("gpt-6-astra", {
  midConversationChannels: false,
});

// Use the channels behind a proxy that sends the request on as it is.
export const throughProxy = anthropicText("claude-opus-5-5", {
  baseURL: "https://llm-proxy.example.com",
  midConversationChannels: true,
});
```

On a model with no channel, `true` changes nothing.

## Keep the record when you store messages

Before each model call, `chat()` compares the tools and the system prompts with the earlier calls. It saves a small record on the first assistant message of the call, in the `midConversationChange` field. The record holds tool names and short prompt hashes, not tool definitions.

The next turn reads these records. So:

- If you save messages yourself, keep the `midConversationChange` field.
- With [`withPersistence`](../persistence/chat-persistence), you do nothing. The store keeps the record, even when `useChat` sends the same message back without it.
- With plain `useChat` and no store, the records last for one `chat()` call. Each new turn starts fresh, and the cache breaks once per turn.

## Limits

These changes still break the cache one time:

- A tool that you remove, or a tool that keeps its name but gets a new definition.
- A system prompt that you edit, move, or add anywhere but the end.
- A provider tool, such as `webSearchTool()`, in the request. That request sends the full `tools` list. Prompt changes still go into the conversation.
- The structured-output call at the end of a run with `outputSchema`. It sends the full request.

You now keep the prompt cache when your agent picks up new tools or prompts mid-conversation.
