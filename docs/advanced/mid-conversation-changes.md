---
title: Mid-Conversation Changes
id: mid-conversation-changes
order: 17
description: "Add tools or system prompts during a conversation and keep the provider's prompt cache. TanStack AI sends the change through the model's own channel on GPT and Claude models that have one."
keywords:
  - tanstack ai
  - prompt caching
  - mid-conversation changes
  - dynamic tools
  - additional_tools
  - tool_addition
---

Your agent gets a new tool in the middle of a conversation. A middleware adds it after the first tool call, a [lazy tool](../tools/lazy-tool-discovery) is found, or the user connects an MCP server. `chat()` asks the provider to cache the start of each request ([Prompt Caching](./prompt-caching)), and the tool list is at the start. A new tool changes the start, so the provider cannot use its cache. The next call costs more and starts slower.

On models with a mid-conversation channel, TanStack AI keeps the start of the request the same and sends the change later in the conversation. You change no code.

## Add a tool during a run

This route starts with one tool. A middleware adds a second tool after the first tool call:

```ts group=mid-conversation-changes
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
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

// Adds get_forecast before the second model call.
const addForecast: ChatMiddleware = {
  name: "add-forecast",
  onConfig: (ctx, config) => {
    if (ctx.phase !== "beforeModel" || ctx.iteration === 0) return;
    if (config.tools.some((tool) => tool.name === "get_forecast")) return;
    return { tools: [...config.tools, getForecast] };
  },
};

export async function POST(request: Request) {
  const { messages } = await request.json();
  const stream = chat({
    adapter: openaiText("gpt-6-astra"),
    messages,
    tools: [getWeather],
    middleware: [addForecast],
  });
  return toServerSentEventsResponse(stream);
}
```

What each model call sends:

| Model | First call | Second call |
|---|---|---|
| `gpt-6-astra` | `tools`: `get_weather` | The same `tools`. An `additional_tools` item with `get_forecast` comes after the tool result. |
| `claude-opus-5-5` | `tools`: `get_weather` and a placeholder tool | The same `tools`, then `get_forecast` with `defer_loading: true`. A `system` message with a `tool_addition` block comes after the tool result. |
| A model with no channel, for example `gpt-6.1-sol` | `tools`: `get_weather` | `tools`: `get_weather` and `get_forecast` |

## What happens on its own

Before each model call, the library compares the tools and the system prompts with the earlier calls:

1. The first call is a start point. Its tools and system prompts stay at the start of every later request.
2. A tool that you add is a change. A system prompt that you add at the end of the list is a change too. A change goes out at its place in the conversation, in the model's own format.
3. Any other difference makes a new start point. That request sends the full lists.

The library saves a small record on the first assistant message of a call that makes a start point or a change, in the `midConversationChange` field. The record holds tool names and short prompt hashes, not tool definitions. Keep the field when you store messages yourself.

## The models

| Provider | Models | Channels |
|---|---|---|
| OpenAI (`openaiText`) | `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol` | Tools and system prompts |
| Anthropic (`anthropicText`) | `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-fable-5`, `claude-fable-5-1` | Tools and system prompts |

Every other model and adapter sends the full lists on each call. The channels are on by default only when the adapter talks to the provider's own API. See [Turn it on or off](#turn-it-on-or-off).

To check an adapter in code, read `midConversationChannels` on it:

```ts group=mid-conversation-changes
const adapter = openaiText("gpt-6-astra");
console.log(adapter.midConversationChannels); // { tools: true, systemPrompts: true }
```

It is `undefined` on a model with no channel, and on an adapter with the channels off.

The provider pages show the request shapes: [OpenAI](../adapters/openai#tools-and-prompts-added-during-a-conversation) and [Anthropic](../adapters/anthropic#tools-and-prompts-added-during-a-conversation).

## See it in the usage numbers

Log `usage.promptTokensDetails.cachedTokens` for each model call, as in [Track cached tokens and cost](./prompt-caching#track-cached-tokens-and-cost). After a tool is added, the next call still reads the start of the request from the cache. On a model with no channel, the cached tokens drop at that call.

On Claude, the automatic tool cache marker stays on the last tool of the start point. The placeholder and the added tools get no marker, so the marked start does not move.

## Turn it on or off

The channels are on by default when the adapter talks to the provider's own API. A gateway or a proxy can drop or change the extra request fields, so the channels are off by default when the adapter talks to another endpoint:

- a custom `baseURL` or a custom `fetch`
- a proxy in the `OPENAI_BASE_URL` or `ANTHROPIC_BASE_URL` environment variable

An Anthropic adapter on your own client (`createAnthropicChatWithClient`, `anthropicVertexText`) has no channels.

Set `midConversationChannels` in the adapter config to choose:

- `false`: every call sends the full lists.
- `true`: use the channels with a custom `baseURL` or `fetch`, or with a base URL from the environment. Set it only when that endpoint sends the request to the provider as it is.

```ts group=mid-conversation-changes
import { anthropicText } from "@tanstack/ai-anthropic";

const fullGpt = openaiText("gpt-6-astra", { midConversationChannels: false });
const proxiedClaude = anthropicText("claude-opus-5-5", {
  baseURL: "https://llm-proxy.example.com",
  midConversationChannels: true,
});
```

On a model with no channel, `true` changes nothing.

## Limits

- These break the cache once: a removed tool, an edited system prompt, a new order of the system prompts, and a tool that keeps its name but gets a new definition. The lazy discovery tool leaves the list when every lazy tool is found, so that call breaks it once too.
- A provider tool, for example `webSearchTool()`, in the start point or in a change: that request sends the full `tools`. System prompt changes still use the channel.
- With a harness or a message store ([`withPersistence`](../persistence/chat-persistence)), the records last across turns and restarts. With plain `useChat` and no message store, they last for one `chat()` call, so each turn starts a new start point.
- The structured-output call at the end of a run with `outputSchema` sends the full request.
- Claude on Vertex or Bedrock, the Chat Completions adapters, and the other adapters on the OpenAI API have no channels.

## In a harness

A harness session keeps its messages in the session log. So the records hold across turns, a restart, and a `/model` switch. You set nothing.

- Tools that a plugin finds before a turn ([Tools that appear later](../harness/mcp#tools-that-appear-later)) go out as a change on a model with a channel.
- After a `/model` switch to a model with no channel, each call sends the full lists. A switch back continues from the stored records.
- A `project` function or a compaction that removes the assistant message with the start point makes a new start point. The cache breaks once.

## What you have now

- Tools and system prompts that you add during a conversation keep the prompt cache on GPT and Claude models with a channel.
- The full request on every other model.
- One option, `midConversationChannels`: `false` sends the full request on every call, and `true` uses the channels behind a gateway or a proxy.
