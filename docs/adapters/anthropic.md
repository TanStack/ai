---
title: Anthropic
id: anthropic-adapter
order: 2
description: "Use Anthropic Claude models with TanStack AI — Claude Fable 5, Claude Sonnet 5, Claude Opus, and more via the @tanstack/ai-anthropic adapter."
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

The Anthropic adapter provides access to Claude models, including Claude Fable 5, Claude Sonnet 5, Claude Opus 4.8, and more.

## Installation

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

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";

const adapter = createAnthropicChat("claude-sonnet-4-6", process.env.ANTHROPIC_API_KEY!, {
  // ... your config options
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createAnthropicChat, type AnthropicTextConfig } from "@tanstack/ai-anthropic";

const config: Omit<AnthropicTextConfig, "apiKey"> = {
  baseURL: "https://api.anthropic.com", // Optional, for custom endpoints
};

const adapter = createAnthropicChat("claude-sonnet-4-6", process.env.ANTHROPIC_API_KEY!, config);
```

The adapter supports [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call). An adapter with an injected `client`, such as Claude on Vertex, ignores it, because the adapter cannot reach that fetch.

## Bearer and OAuth tokens

Use `authToken` for a Bearer token. The adapter sends `Authorization: Bearer` and omits `x-api-key`:

```typescript
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const stream = chat({
  adapter: anthropicText('claude-sonnet-5-5', {
    authToken: process.env.ANTHROPIC_AUTH_TOKEN,
  }),
  messages: [{ role: 'user', content: 'Hello!' }],
})

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') console.log(chunk.delta)
}
```

Without explicit credentials, the adapter reads the environment in this order:

1. `ANTHROPIC_AUTH_TOKEN`.
2. `ANTHROPIC_OAUTH_TOKEN`.
3. `ANTHROPIC_API_KEY`.

Explicit `authToken` or `apiKey` takes precedence over environment credentials. When both explicit values exist, `authToken` takes precedence.

OAuth tokens containing `sk-ant-oat` are detected automatically. An environment `ANTHROPIC_OAUTH_TOKEN` also selects OAuth when `ANTHROPIC_AUTH_TOKEN` is absent. Set `oauth: true` to select OAuth explicitly.

OAuth requests include the Claude Code identity system block, CLI identity headers, and the `claude-code-20250219` and `oauth-2025-04-20` betas. A Bearer token alone does not select OAuth. An injected SDK client owns its credentials. Adapter OAuth options still control the request identity.

To call Claude models through a GitHub Copilot plan, see [GitHub Copilot](./openai-compatible#claude-models).

## Replay unsigned gateway thinking

Some Anthropic-protocol gateways return readable thinking without a signature. Enable replay for those replies with `allowEmptySignature`:

```typescript
import { anthropicText } from '@tanstack/ai-anthropic'

const gateway = anthropicText('claude-sonnet-5-5', {
  baseURL: 'https://gateway.example.com',
  apiKey: process.env.GATEWAY_API_KEY,
  provider: 'my-anthropic-gateway',
  allowEmptySignature: true,
})

console.log(gateway.provider)
```

`allowEmptySignature` defaults to `false`. It permits ordinary unsigned thinking for matching-source history. Redacted thinking still requires its provider data. Foreign history uses the normal replay rules.

Set `provider` to identify the gateway separately from direct Anthropic. Source matching compares the provider, API, and requested model. See [Keep saved history when you switch](../advanced/runtime-adapter-switching#keep-saved-history-when-you-switch).

## Claude on Vertex

Use `@tanstack/ai-anthropic/vertex` when Claude must run on Vertex AI. That
is the path for regional endpoints and Google Cloud credentials.

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

`anthropicVertexText` accepts only the Claude models in the Vertex catalog.
It does not accept Anthropic-only ids such as `claude-opus-5-fast`.

`project` and `location` use the same names as `@tanstack/ai-vertex`, so one
auth object works for Gemini and Claude.

If you omit `project`, Application Default Credentials can still fill it.
`location` is required. You can pass it on the factory or set
`GOOGLE_CLOUD_LOCATION`, `GOOGLE_VERTEX_LOCATION`, or `CLOUD_ML_REGION`.

Gemini on Vertex lives in [`@tanstack/ai-vertex`](./vertex).

## Custom Anthropic client

Use `createAnthropicChatWithClient` when you already have an
Anthropic-compatible client. The adapter only needs `beta.messages.create`.
Message mapping, streaming, tools, media, usage, and structured output stay
on the same TanStack path.

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

The injected client must implement the Anthropic Beta Messages protocol.
Endpoint-specific model and feature support stays the caller's job.

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: anthropicText("claude-sonnet-4-6"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { z } from "zod";

const searchDatabaseDef = toolDefinition({
  name: "search_database",
  description: "Search the database",
  inputSchema: z.object({
    query: z.string(),
  }),
});

const searchDatabase = searchDatabaseDef.server(async ({ query }) => {
  // Search database
  return { results: [] };
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: anthropicText("claude-sonnet-4-6"),
    messages,
    tools: [searchDatabase],
  });

  return toServerSentEventsResponse(stream);
}
```

## Model Options

Anthropic supports various provider-specific options. Sampling parameters live here too — `temperature`, `top_p`, and `max_tokens` — rather than as root-level props on `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    max_tokens: 4096,
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    stop_sequences: ["END"],
  },
});
```

> If you previously passed `temperature` / `topP` / `maxTokens` at the root of `chat()`, see [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

#### `max_tokens` default

Anthropic's Messages API _requires_ `max_tokens` on every request, so the adapter always sends a value. When you don't set `modelOptions.max_tokens`, it defaults to the selected model's full output ceiling (`max_output_tokens` from the model metadata — e.g. 64K for Sonnet, 128K for Opus), falling back to a safe constant for unrecognized models. `max_tokens` is a ceiling, not a reservation — billing is on tokens actually generated — so this default costs nothing extra and avoids the silent mid-response truncation (`stop_reason: "max_tokens"`) that a low default would cause. Set `max_tokens` explicitly only when you want to _cap_ output below the model ceiling. If a response is truncated while using the default cap, the adapter logs a warning (visible with [debug logging](../advanced/debug-logging) enabled).

A streamed response that stops at `max_tokens` ends in a `RUN_ERROR` with `code: 'max_tokens'`. Anthropic bills the tokens of that call, so this `RUN_ERROR` carries the `usage` of the call. The `onUsage` middleware hook fires only for `RUN_FINISHED`. To count these tokens too, read `usage` from the `RUN_ERROR` chunk, in the stream or in an `onChunk` middleware.

One exception: structured output (`chat({ outputSchema })`) on models that use the non-streaming finalization path clamps this default to ~21K tokens. The Anthropic SDK rejects a non-streaming request whose `max_tokens` could exceed its 10-minute timeout, so the full ceiling can't be used there. Streaming chat is unaffected. To raise the structured-output ceiling toward a model's true max, stream the response.

### Thinking

Set how hard Claude thinks with `reasoning` on `chat()`. The adapter turns the level into the right thinking fields for the model:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-5"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  reasoning: "xhigh",
});
```

What the adapter sends for each kind of model:

- **Claude 4.7 and later, Sonnet 5, Fable 5**: adaptive thinking, with the level as `output_config.effort`.
- **Claude Opus 4.6 and Sonnet 4.6**: adaptive thinking, with the level as `effort`.
- **Haiku 4.5, Sonnet 4.5, Opus 4.5, Opus 4.1**: thinking with a token budget. Set it with `reasoning: { level: "high", budgetTokens: 8000 }`. The adapter raises `max_tokens` when it is below the budget.
- **`off`**: thinking disabled. `claude-fable-5` and `claude-sonnet-5-5` always think, so their types do not take `off`.

The thinking text streams back as thinking parts. Pass `summary: false` to keep it hidden: `reasoning: { level: "high", summary: false }`. See [Reasoning](../chat/reasoning) for the levels and how a level the model does not have moves to the nearest one.

#### Change the level during a conversation

A new level changes the start of the request, so Claude reads nothing from the cache. On `claude-fable-5-1`, `claude-opus-5`, and `claude-opus-5-5`, the level goes into the messages instead. Then a new level keeps the cached start.

On Anthropic's own API, the adapter does this for these models by default:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-opus-5-5"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  reasoning: "low",
});
```

With a custom `baseURL`, a custom `fetch`, or a proxy in `ANTHROPIC_BASE_URL`, it is off, because the endpoint must pass the betas. To turn it on there, set `midConversationEffort: true` in the `reasoning` config. `modelReasoning(record)` sets it for these models in the [model catalog](../models/catalog), also for their OpenRouter ids:

```typescript
import { chat } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { getModel, modelReasoning } from "@tanstack/ai-models";

const record = getModel("openrouter", "anthropic/claude-opus-5.5");
if (record) {
  const stream = chat({
    adapter: createAnthropicChat(
      record.id,
      process.env.OPENROUTER_API_KEY ?? "",
      { baseURL: record.baseUrl, reasoning: modelReasoning(record) },
    ),
    messages: [{ role: "user", content: "Plan a database migration." }],
    reasoning: "low",
  });
}
```

What the adapter sends with `midConversationEffort`:

- `thinking` with `type: "adaptive"` and `block_binding`, and `output_config.effort: "high"`, on every request.
- At the end of the messages, a `system` message with no content and `output_config.effort` set to the level of this call.
- The same message before each earlier answer of this adapter, with the level of that answer. The answer keeps it in `metadata.tanstack.reasoningEffort`.
- The `anthropic-beta` header with `mid-conversation-output-config-2026-07-01` and `thinking-binding-controls-2026-08-01`.
- No `temperature`.

### Prompt Caching

`chat()` caches Claude prompts by default. It adds `cache_control` markers to the system prompt, the last tool, and the last user message. To send no markers, pass `promptCache: 'none'`. For the retention, the cache key, and the cost, see [Prompt Caching](../advanced/prompt-caching).

To place a marker yourself, set `cache_control` in the `metadata` of a message part, a system prompt, or a tool. A marker of your own turns the automatic markers off for that request:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-5-5"),
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

`modelOptions.cache_control` asks Anthropic to place one marker for the whole request. It also turns the automatic markers off.

#### Tools and prompts added during a conversation

On some Claude models, a tool or a system prompt that you add between model calls goes into the conversation, not into `tools` or `system`. The marked start of the request stays the same, so Claude reads it from the cache.

The models: `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-fable-5`, and `claude-fable-5-1`.

What the adapter sends on these models:

- `system` keeps the system prompts of the first call, with their `cache_control`.
- In a request with tools, the `anthropic-beta` header has `mid-conversation-tool-changes-2026-07-01`, and `tools` has one placeholder tool, `__tanstack_deferred_placeholder__`. The model must never call it. It keeps Anthropic's hidden setup for added tools inside the cached start.
- An added tool goes to the end of `tools` with `defer_loading: true`. A `system` message lists it in a `tool_addition` block.
- A system prompt that you add goes into a `system` message as a text block. The message comes directly before the next assistant message, or at the end of the messages.
- With a provider tool such as `webSearchTool()` in the first call or in a change, `tools` is the full list and has no placeholder.

The automatic tool marker goes on the last tool of the first call, not on the placeholder or an added tool. So the marked start does not move when a tool is added. A `cache_control` of your own still wins.

The channels are on by default with Anthropic's own API. With a custom `baseURL`, a custom `fetch`, or a proxy in the `ANTHROPIC_BASE_URL` environment variable, they are off, and every request is the same as on a model outside the list. An adapter on your own client (`createAnthropicChatWithClient`, `anthropicVertexText`) has no channels. Set `midConversationChannels` to choose:

- `false`: send the full lists on every call.
- `true`: use the channels with a custom `baseURL`, `fetch`, or `ANTHROPIC_BASE_URL`. Set it only when that endpoint sends the request and the `anthropic-beta` header to Anthropic as they are.
- `{ systemPrompts: true }` or `{ tools: true }`: use only that channel, for an endpoint that passes only one. With `{ systemPrompts: true }`, an added prompt goes into a `system` message, and an added tool goes out in the full `tools` list.

```typescript
import { anthropicText } from "@tanstack/ai-anthropic";

export const fullLists = anthropicText("claude-opus-5-5", {
  midConversationChannels: false,
});

export const throughProxy = anthropicText("claude-opus-5-5", {
  baseURL: "https://llm-proxy.example.com",
  midConversationChannels: true,
});

export const promptsOnly = anthropicText("claude-opus-5-5", {
  baseURL: "https://llm-gateway.example.com",
  midConversationChannels: { systemPrompts: true },
});
```

See [Mid-Conversation Changes](../advanced/mid-conversation-changes) for how the library finds the changes.

## Summarization

Anthropic supports text summarization:

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

## Environment Variables

Set your API key in environment variables:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## API Reference

Every factory pair follows the same shape: the short factory (`anthropicText`, `anthropicSummarize`) reads `ANTHROPIC_API_KEY` from the environment, while `createAnthropicChat` / `createAnthropicSummarize` take an explicit API key. Both take `model` as the first argument. For Claude on Vertex, use `anthropicVertexText` from `@tanstack/ai-anthropic/vertex`. For any other custom transport, `createAnthropicChatWithClient` accepts an Anthropic-compatible Messages client.

### `anthropicText(model, config?)` / `createAnthropicChat(model, apiKey, config?)`

Creates an Anthropic chat adapter.

**Parameters:**

- `model` - Claude model id (e.g. `"claude-sonnet-5"`, `"claude-fable-5"`, `"claude-opus-4-8"`)
- `config?.baseURL` - Custom base URL (optional)

### `anthropicVertexText(model, config?)`

Creates an Anthropic chat adapter on Vertex. Import it from
`@tanstack/ai-anthropic/vertex`.

**Parameters:**

- `model` - Claude model id
- `config.project` - GCP project id (optional if ADC can resolve it)
- `config.location` - Vertex region (or set `GOOGLE_CLOUD_LOCATION`)

### `createAnthropicChatWithClient(model, client)`

Creates an Anthropic chat adapter using an injected client.

**Parameters:**

- `model` - Claude model id
- `client` - Client exposing `beta.messages.create`

### `anthropicSummarize(model, config?)` / `createAnthropicSummarize(model, apiKey, config?)`

Creates an Anthropic summarization adapter.

## Limitations

- **Image Generation**: Anthropic does not support image generation. Use OpenAI or Gemini for image generation.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers

## Provider Tools

Anthropic exposes several native tools beyond user-defined function calls.
Import them from `@tanstack/ai-anthropic/tools` and pass them into
`chat({ tools: [...] })`.

> For the full concept, a comparison matrix, and type-gating details, see
> [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

Enables Claude to run Anthropic's native web search with inline citations.
Scope the search with `allowed_domains` or `blocked_domains` (mutually
exclusive); set `max_uses` to cap per-turn cost.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { webSearchTool } from "@tanstack/ai-anthropic/tools";

const stream = chat({
  adapter: anthropicText("claude-opus-4-7"),
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

Lets Claude fetch the contents of a URL directly, useful when you want the
model to read a specific page rather than run a search. Takes no required
arguments — pass an optional config object to override defaults.

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

**Supported models:** Claude Sonnet 4.x and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `codeExecutionTool`

Gives Claude a sandboxed code-execution environment so it can run Python
snippets, analyse data, and return results inline. Choose the version string
that matches your desired API revision.

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

**Supported models:** Claude Sonnet 4.x and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

#### Attaching hosted skills

Pass a `skills` array as the second argument to load provider-managed skill
bundles into the sandbox. The adapter auto-lifts them into the API's
`container.skills` param and adds the required beta headers for you.

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

For the full reference — skill shape, constraints, scope, and the OpenAI
equivalent — see [Provider Skills](../tools/provider-skills.md).

### `computerUseTool`

Allows Claude to observe a virtual desktop (screenshots) and interact with it
via keyboard and mouse events. Provide the screen resolution so Claude can
calculate accurate coordinates.

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { computerUseTool } from "@tanstack/ai-anthropic/tools";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Open the browser and go to example.com" }],
  tools: [
    computerUseTool({
      type: "computer_20250124",
      name: "computer",
      display_width_px: 1024,
      display_height_px: 768,
    }),
  ],
});
```

**Supported models:** Claude Sonnet 3.5 and above, with two exceptions. `claude-opus-5-fast` takes no provider tools. Claude Opus 5.5, Claude Sonnet 5.5, and Claude Haiku 5.5 accept only the `computer_toolset_20260801` toolset, which the adapter does not offer yet. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `bashTool`

Provides Claude with a persistent bash shell session, letting it run arbitrary
commands, install packages, or manipulate files on the host. Choose the type
string that matches your API revision.

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

**Supported models:** Claude Sonnet 3.5 and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `textEditorTool`

Gives Claude a structured text-editor interface for viewing and modifying files
using `str_replace`, `create`, `view`, and `undo_edit` commands. Choose the
type string for the API revision you target.

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

**Supported models:** Claude Sonnet 3.5 and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `memoryTool`

Enables Claude to store and retrieve information across conversation turns
using Anthropic's managed memory service. Call with no arguments to use
default configuration.

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

**Supported models:** Claude Sonnet 4.x and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `customTool`

Creates a tool with an inline JSON Schema input definition instead of going
through `toolDefinition()`. Useful when you need fine-grained control over the
schema shape or want to add `cache_control`. Unlike branded provider tools,
`customTool` returns a plain `Tool` and is accepted by any chat model.

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
