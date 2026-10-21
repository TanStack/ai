---
title: "Anthropic: Advanced"
id: anthropic-advanced
order: 2
description: "Advanced Anthropic setup in TanStack AI: Bearer and OAuth tokens, gateways, Claude on Vertex, the max_tokens default, prompt caching, every provider tool, and the API reference."
keywords:
  - tanstack ai
  - anthropic
  - claude
  - claude on vertex
  - oauth
  - prompt caching
  - provider tools
  - adapter
---

This page has the details of the Anthropic adapter. To get a first chat working, start at [Anthropic](./anthropic).

## Bearer and OAuth tokens

Got a Bearer token, not an API key? Pass it as the credential and set `auth: "bearer"`. The adapter sends `Authorization: Bearer <token>` and no `x-api-key` header:

```typescript
import { chat } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";

const adapter = createAnthropicChat("claude-sonnet-5-5", process.env.MY_CLAUDE_TOKEN!, {
  auth: "bearer",
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

`auth` takes one of three values:

- `"api-key"`: sends the `x-api-key` header. This is the default.
- `"bearer"`: sends `Authorization: Bearer <token>` and no `x-api-key` header.
- `"oauth"`: sends the token like `"bearer"`, plus the Claude Code extras below.

A Claude OAuth token contains `sk-ant-oat`. For such a token, the adapter picks `"oauth"`, so you can leave `auth` out. In OAuth mode, every request also gets:

- the Claude Code identity system block, before your own system prompts.
- the Claude Code CLI headers (`user-agent` and `x-app`).
- the `claude-code-20250219` and `oauth-2025-04-20` betas.

An explicit `auth` always wins. To send an `sk-ant-oat` token as a plain Bearer token, without the extras, set `auth: "bearer"`.

Is the token in your environment? Then `anthropicText` finds it and picks `auth` for you. See [Set the API key](./anthropic#2-set-the-api-key) for the order of the variables:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

// ANTHROPIC_AUTH_TOKEN=my-token in your environment
const stream = chat({
  adapter: anthropicText("claude-sonnet-5-5"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

An `auth` in the config wins over the kind that the adapter picks. To call Claude models through a GitHub Copilot plan, see [GitHub Copilot](./openai-compatible-advanced#claude-models).

## Configuration

```typescript
import { createAnthropicChat, type AnthropicTextConfig } from "@tanstack/ai-anthropic";

const config: Omit<AnthropicTextConfig, "apiKey"> = {
  baseURL: "https://api.anthropic.com", // Optional, for custom endpoints
};

const adapter = createAnthropicChat("claude-sonnet-5-5", process.env.ANTHROPIC_API_KEY!, config);
```

Need a header on each request, or a log of each model call? This adapter supports [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call). An adapter with your own client (Claude on Vertex, or `createAnthropicChatWithClient`) ignores it, because the adapter cannot reach the fetch of that client.

## Replay thinking through a gateway

Your gateway speaks the Anthropic protocol, but it returns thinking with no signature. By default, the adapter does not send unsigned thinking back, so the next turn loses it. Turn on `allowEmptySignature`:

```typescript
import { anthropicText } from "@tanstack/ai-anthropic";

const gateway = anthropicText("claude-sonnet-5-5", {
  baseURL: "https://gateway.example.com",
  provider: "my-gateway",
  allowEmptySignature: true,
});

console.log(gateway.provider); // "my-gateway"
```

- `allowEmptySignature` is `false` by default. It sends unsigned thinking back only for history from the same source.
- Redacted thinking still needs its encrypted data.
- `provider` names the gateway. History from the gateway then counts as a different source from Anthropic itself. See [Keep saved history when you switch](../advanced/runtime-adapter-switching#keep-saved-history-when-you-switch).

## Claude on Vertex

Use `@tanstack/ai-anthropic/vertex` when Claude must run on Vertex AI. That is the path for regional endpoints and Google Cloud credentials.

Install the Vertex SDK next to the Anthropic adapter:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
vue: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
solid: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
svelte: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
preact: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
angular: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
vanilla: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
octane: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk

<!-- ::end:tabs -->

```typescript
import { chat } from "@tanstack/ai";
import { anthropicVertexText } from "@tanstack/ai-anthropic/vertex";

const stream = chat({
  adapter: anthropicVertexText("claude-sonnet-5", {
    project: "my-project",
    location: "europe-west1",
  }),
  messages: [{ role: "user", content: "Hello!" }],
});
```

- `anthropicVertexText` accepts only the Claude models in the Vertex catalog (`ANTHROPIC_VERTEX_CHAT_MODELS`). It does not accept ids that only Anthropic has, such as `claude-opus-5-fast`.
- `project` and `location` use the same names as `@tanstack/ai-vertex`, so one auth object works for Gemini and Claude.
- If you omit `project`, Application Default Credentials can still fill it.
- `location` is required. Pass it on the factory, or set `GOOGLE_CLOUD_LOCATION`, `GOOGLE_VERTEX_LOCATION`, or `CLOUD_ML_REGION`.

Gemini on Vertex is in [`@tanstack/ai-vertex`](./vertex).

## Custom Anthropic client

Already have a client that speaks the Anthropic protocol? Use `createAnthropicChatWithClient`. The adapter only needs `beta.messages.create`. Message mapping, streaming, tools, media, usage, and structured output stay on the same TanStack path.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
vue: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
solid: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
svelte: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
preact: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
angular: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
vanilla: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk
octane: @tanstack/ai-anthropic @anthropic-ai/vertex-sdk

<!-- ::end:tabs -->

```typescript
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { createAnthropicChatWithClient } from "@tanstack/ai-anthropic";

const client = new AnthropicVertex({
  projectId: "my-project",
  region: "europe-west1",
});

const adapter = createAnthropicChatWithClient("claude-sonnet-5", client);
```

The client must implement the Anthropic Beta Messages protocol. Model and feature support of that endpoint is your job.

## `max_tokens` default

The Messages API of Anthropic requires `max_tokens` on every request, so the adapter always sends a value.

- When you do not set `modelOptions.max_tokens`, it is the full output limit of the model (`max_output_tokens` from the model metadata, for example 64K for Sonnet and 128K for Opus).
- For a model that this package does not know, the adapter uses a safe constant.
- `max_tokens` is a limit, not a reservation. Anthropic bills the tokens that the model makes, so this default costs nothing extra. A low default can cut a response short (`stop_reason: "max_tokens"`).
- Set `max_tokens` only to cap the output below the model limit.
- If a response stops at the default limit, the adapter logs a warning. You see it with [debug logging](../advanced/debug-logging) on.

A streamed response that stops at `max_tokens` ends in a `RUN_ERROR` with `code: 'max_tokens'`. Anthropic bills the tokens of that call, so this `RUN_ERROR` carries the `usage` of the call. The `onUsage` middleware hook fires only for `RUN_FINISHED`. To count these tokens too, read `usage` from the `RUN_ERROR` chunk, in the stream or in an `onChunk` middleware.

One exception: structured output (`chat({ outputSchema })`) on models that use the non-streaming finalization path caps this default at about 21K tokens. The Anthropic SDK rejects a non-streaming request whose `max_tokens` can go past its 10-minute timeout. Streaming chat does not have this cap. To raise the structured output limit toward the true maximum of a model, stream the response.

## Prompt caching

`chat()` caches Claude prompts by default. It adds `cache_control` markers, at most 4, to:

- the last start tool. That is the tool before the deferred placeholder, or the last tool.
- the last block of the last user message, or of the last system message in the conversation.
- the system blocks.

Pass `promptCache: 'long'` for the 1-hour cache, or `promptCache: 'none'` to send no markers. For the key and the cost, see [Prompt Caching](../advanced/prompt-caching).

To put the markers in other places, set `cache_control` in the `metadata` of a message part, a system prompt, or a tool. One marker of your own turns the automatic markers off for that request:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-opus-5-5"),
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          content: "What is the capital of France?",
          metadata: {
            cache_control: {
              type: "ephemeral",
            },
          },
        },
      ],
    },
  ],
});
```

- `modelOptions.cache_control` also turns the automatic markers off.
- `usage.promptTokens` counts the full input, cached tokens included. The cache reads and writes are also on `usage.promptTokensDetails`. See [Token usage](../chat/stream-events#token-usage).

### Tools and prompts added during a conversation

On `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-fable-5`, and `claude-fable-5-1`, a tool or a system prompt that you add between model calls goes into the conversation. The cached start of the request stays the same.

What the adapter sends on these models:

- `system` keeps the system prompts of the first call.
- A request with tools gets the `mid-conversation-tool-changes-2026-07-01` beta and one placeholder tool, `__tanstack_deferred_placeholder__`. The model never calls it.
- An added tool goes at the end of `tools` with `defer_loading: true`. A `system` message names it in a `tool_addition` block.
- An added system prompt goes into a `system` message, before the next assistant message or at the end.
- With a provider tool such as `webSearchTool()`, `tools` is the full list and has no placeholder.

The automatic tool marker stays on the last tool of the first call, so the marked start does not move.

The channels are on by default with the API of Anthropic. A custom `baseURL`, a custom `fetch`, `ANTHROPIC_BASE_URL`, or your own client turns them off. Set `midConversationChannels` to choose:

```typescript
import { anthropicText } from "@tanstack/ai-anthropic";

export const fullLists = anthropicText("claude-opus-5-5", {
  midConversationChannels: false,
});

export const throughProxy = anthropicText("claude-opus-5-5", {
  baseURL: "https://llm-proxy.example.com",
  midConversationChannels: true,
});
```

If that endpoint sends the request and the `anthropic-beta` header on to Anthropic without changes, set `true`. See [Mid-Conversation Changes](../advanced/mid-conversation-changes).

## Provider tools

Anthropic has tools of its own, next to the function tools that you define. Import them from `@tanstack/ai-anthropic/tools` and pass them into `chat({ tools: [...] })`.

For the concept, a comparison table, and type gating, see [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

Claude runs the native web search of Anthropic, with inline citations.

- Limit the search with `allowed_domains` or `blocked_domains`. You cannot use both.
- Set `max_uses` to cap the cost of each turn.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { webSearchTool } from "@tanstack/ai-anthropic/tools";

const stream = chat({
  adapter: anthropicText("claude-opus-5-5"),
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

**Supported models:** every registered Claude model. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `webFetchTool`

Claude gets the content of one URL. If the model must read a specific page, not run a search, use it. It needs no arguments. Pass a config object to change the defaults.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { webFetchTool } from "@tanstack/ai-anthropic/tools";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Summarise https://example.com" }],
  tools: [webFetchTool()],
});
```

**Supported models:** Claude Sonnet 4.x and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `codeExecutionTool`

Gives Claude a sandbox that runs code. Claude can run Python, look at data, and return the results inline. Pick the version string of the API revision that you want.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { codeExecutionTool } from "@tanstack/ai-anthropic/tools";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Plot a histogram of [1,2,2,3,3,3]" }],
  tools: [
    codeExecutionTool({ name: "code_execution", type: "code_execution_20250825" }),
  ],
});
```

**Supported models:** Claude Sonnet 4.x and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

#### Attaching hosted skills

Pass a `skills` array as the second argument to load skill bundles that the provider manages into the sandbox. The adapter moves them into the `container.skills` parameter of the API and adds the required beta headers for you.

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { codeExecutionTool } from "@tanstack/ai-anthropic/tools";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: anthropicText("claude-sonnet-4-5"),
    messages,
    tools: [
      codeExecutionTool(
        { type: "code_execution_20250825", name: "code_execution" },
        {
          skills: [{ type: "anthropic", skill_id: "pptx", version: "latest" }],
        },
      ),
    ],
  });

  return toServerSentEventsResponse(stream);
}
```

For the skill shape, the limits, the scope, and the OpenAI equivalent, see [Provider Skills](../tools/provider-skills.md).

### `computerUseTool`

Claude can look at a screen and use the mouse and the keyboard. Your app runs each action and sends back a screenshot. `createComputerUse` from `@tanstack/ai-computer-use` does this on a Playwright browser or an E2B desktop. Each thread gets its own machine:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { createComputerUse } from "@tanstack/ai-computer-use";
import { playwrightComputer } from "@tanstack/ai-computer-playwright";

declare const threadId: string;

const computerUse = createComputerUse({
  driver: playwrightComputer({ startUrl: "https://tanstack.com" }),
});

const stream = chat({
  adapter: anthropicText("claude-opus-5-5"),
  messages: [{ role: "user", content: "Find the TanStack AI docs" }],
  threadId,
  tools: computerUse.tools,
  middleware: [computerUse.middleware],
  interrupts: [computerUse.interrupt],
});
```

The adapter sends the `computer` tool to Claude as the newest native computer tool that your model takes.

- For the setup, the threads, and how to close the machines, see [Computer use](../computer-use/computer-use.md).
- For your own machine, see [Custom driver](../computer-use/custom-driver.md).

#### The raw tool

`computerUseTool` from `@tanstack/ai-anthropic/tools` is the native tool with no `execute`. Use it when your app runs the actions itself. Pick the version that your model takes:

| Version | Models |
| --- | --- |
| `computer_toolset_20260801` | Claude Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1, Fable 5, Opus 5, Sonnet 5, Opus 4.8 |
| `computer_20251124` | Claude Fable 5.1, Fable 5, Opus 5, Sonnet 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 4.6, Opus 4.5 |
| `computer_20250124` | Claude Sonnet 4.5, Haiku 4.5, Opus 4.1 |

```typescript
import { computerUseTool } from "@tanstack/ai-anthropic/tools";

const computer = computerUseTool({ type: "computer_toolset_20260801" });
```

The earlier versions also take a name and the screen size:

```typescript
import { computerUseTool } from "@tanstack/ai-anthropic/tools";

const computer = computerUseTool({
  type: "computer_20251124",
  name: "computer",
  display_width_px: 1280,
  display_height_px: 800,
});
```

Add an `execute` that runs the action and returns a result:

- Every version calls `execute` with the action in `input.action`. With the toolset, Claude calls each action as its own tool. The adapter gives you each call as one `computer` call.
- Return a screenshot as an image part for the `screenshot` action, and `"OK"` for the other actions.
- Send screenshots that fit the image limits of the model. The toolset refuses a large screenshot. It does not make it smaller.
- The toolset turns on `zoom` by default. Return an image for the `zoom` action, or turn it off with `configs: { zoom: { enabled: false } }`.
- The adapter sends the beta header that an earlier version needs. The toolset needs no beta header.

Claude gives coordinates in the pixels of your screenshots.

A version that your model does not take is a type error. `claude-opus-5-fast` takes no provider tools. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `bashTool`

Gives Claude a bash shell session that stays open. Claude can run commands, install packages, or change files on the host. Pick the type string of your API revision.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { bashTool } from "@tanstack/ai-anthropic/tools";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "List all TypeScript files in src/" }],
  tools: [bashTool({ name: "bash", type: "bash_20250124" })],
});
```

**Supported models:** Claude Sonnet 3.5 and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `textEditorTool`

Gives Claude a text editor to view and change files, with the `str_replace`, `create`, `view`, and `undo_edit` commands. Pick the type string of the API revision that you use.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { textEditorTool } from "@tanstack/ai-anthropic/tools";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Fix the bug in src/index.ts" }],
  tools: [
    textEditorTool({ type: "text_editor_20250124", name: "str_replace_editor" }),
  ],
});
```

**Supported models:** Claude Sonnet 3.5 and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `memoryTool`

Claude stores and reads facts across turns with the managed memory service of Anthropic. Call it with no arguments to use the default configuration.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { memoryTool } from "@tanstack/ai-anthropic/tools";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Remember that I prefer metric units" }],
  tools: [memoryTool()],
});
```

**Supported models:** Claude Sonnet 4.x and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `customTool`

Makes a tool with an inline schema, without `toolDefinition()`. If you need full control of the schema shape, or want to add `cache_control`, use it. `customTool` returns a plain `Tool`, so every chat model accepts it.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { customTool } from "@tanstack/ai-anthropic/tools";
import { z } from "zod";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Look up user 42" }],
  tools: [
    customTool(
      "lookup_user",
      "Look up a user by ID and return their profile",
      z.object({ userId: z.number() }),
    ),
  ],
});
```

**Supported models:** all current Claude models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

## API reference

Each factory pair has the same shape. The short factory (`anthropicText`, `anthropicSummarize`) reads the credential from the [environment](./anthropic#2-set-the-api-key). The `create*` factory takes an explicit credential and never reads one from the environment. Both take `model` as the first argument.

### `anthropicText(model, config?)` / `createAnthropicChat(model, apiKey, config?)`

Creates an Anthropic chat adapter.

- `model`: a Claude model id, for example `"claude-sonnet-5-5"` or `"claude-opus-5-5"`.
- `apiKey`: an API key, a Bearer token, or a Claude OAuth token (`createAnthropicChat` only).
- `config?.baseURL`: a custom base URL. Optional.
- `config?.auth`: how to send the credential: `"api-key"`, `"bearer"`, or `"oauth"`. Optional. See [Bearer and OAuth tokens](#bearer-and-oauth-tokens).
- `config?.allowEmptySignature`: send unsigned thinking back to the same source. Optional, default `false`. See [Replay thinking through a gateway](#replay-thinking-through-a-gateway).
- `config?.provider`: the source name for a gateway. Optional, default `"anthropic"`.

`adapter.inputModalities` lists the input kinds of the selected model. It is `undefined` for a model that this package does not know. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

### `anthropicVertexText(model, config?)`

Creates an Anthropic chat adapter on Vertex. Import it from `@tanstack/ai-anthropic/vertex`.

- `model`: a Claude model id from the Vertex catalog.
- `config.project`: the GCP project id. Optional if ADC can find it.
- `config.location`: the Vertex region. You can also set `GOOGLE_CLOUD_LOCATION`.

### `createAnthropicChatWithClient(model, client)`

Creates an Anthropic chat adapter with a client that you give.

- `model`: a Claude model id.
- `client`: a client with `beta.messages.create`.

### `anthropicSummarize(model, config?)` / `createAnthropicSummarize(model, apiKey, config?)`

Creates an Anthropic summarization adapter.

### `anthropicFiles` / `createAnthropicFiles`

Creates a Files API adapter. See [Files API](../advanced/files-api).
