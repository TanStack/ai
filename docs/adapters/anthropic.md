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

```bash
npm install @tanstack/ai-anthropic
```

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

One exception: structured output (`chat({ outputSchema })`) on models that use the non-streaming finalization path clamps this default to ~21K tokens. The Anthropic SDK rejects a non-streaming request whose `max_tokens` could exceed its 10-minute timeout, so the full ceiling can't be used there. Streaming chat is unaffected. To raise the structured-output ceiling toward a model's true max, stream the response.

### Thinking (Extended Thinking)

Enable extended thinking with a token budget. This allows Claude to show its reasoning process, which is streamed as `thinking` chunks:

```typescript ignore
modelOptions: {
  thinking: {
    type: "enabled",
    budget_tokens: 2048, // Maximum tokens for thinking
  },
}
```

**Note:** `budget_tokens` must be less than `modelOptions.max_tokens` — set `max_tokens` high enough to leave room for the visible response alongside the thinking budget, or the request is rejected.

### Adaptive Thinking (Claude 4.6+, Sonnet 5, Fable 5)

Newer Claude models use adaptive thinking — the model decides when and how
much to think, and depth is tuned with `output_config.effort` instead of a
token budget:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-5"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  modelOptions: {
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "xhigh" },
    max_tokens: 64_000,
  },
});
```

Per-model rules (enforced by the adapter's types):

- **`claude-sonnet-5`, `claude-opus-4-8`, `claude-opus-4-7`** — adaptive
  thinking with an explicit `{ type: "disabled" }` opt-out. The manual
  `{ type: "enabled", budget_tokens }` shape is rejected with a 400, and
  the sampling parameters (`temperature`, `top_p`, `top_k`) are not
  accepted (on Sonnet 5 the API rejects non-default values; on Opus
  4.7/4.8 the parameters are removed entirely).
- **`claude-fable-5`** — thinking is always on. The only accepted explicit
  config is `{ type: "adaptive" }` (both `disabled` and `budget_tokens`
  return a 400), and sampling parameters are rejected.
- **`claude-opus-4-6` / `claude-sonnet-4-6`** — accept
  `{ type: "adaptive" }` alongside the deprecated
  `{ type: "enabled", budget_tokens }` shape, and still accept sampling
  parameters.
- **`display`** defaults to `"omitted"` on Opus 4.7+ and the 5-generation
  models — set `"summarized"` to stream the reasoning text.
- **`effort`** accepts `"low" | "medium" | "high" | "xhigh" | "max"`;
  `"xhigh"` is available on Claude Opus 4.7+, Claude Sonnet 5, and
  Claude Fable 5.

### Prompt Caching

Cache prompts for better performance and reduced costs:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
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

Every factory pair follows the same shape: the short factory (`anthropicText`, `anthropicSummarize`) reads `ANTHROPIC_API_KEY` from the environment, while `createAnthropicChat` / `createAnthropicSummarize` take an explicit API key. Both take `model` as the first argument.

### `anthropicText(model, config?)` / `createAnthropicChat(model, apiKey, config?)`

Creates an Anthropic chat adapter.

**Parameters:**

- `model` - Claude model id (e.g. `"claude-sonnet-5"`, `"claude-fable-5"`, `"claude-opus-4-8"`)
- `config?.baseURL` - Custom base URL (optional)

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

**Supported models:** Claude Sonnet 3.5 and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

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
