---
title: Anthropic
id: anthropic-adapter
order: 2
description: "Claude models via @tanstack/ai-anthropic — chat, tools, thinking, summarization, provider tools."
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

If you need Claude chat → install, set `ANTHROPIC_API_KEY`, call `anthropicText(model)`.

## Install

```bash
npm install @tanstack/ai-anthropic
```

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## Do this

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Explicit API key

```typescript
import { chat } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";

const adapter = createAnthropicChat("claude-sonnet-4-6", process.env.ANTHROPIC_API_KEY!, {
  // baseURL, ...
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Server endpoint

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

### With tools

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

## Model options

Sampling lives in `modelOptions` — not root props on `chat()`:

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

> Migrating root-level sampling? See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### `max_tokens` default

Anthropic requires `max_tokens`. If unset, the adapter sends the model's full output ceiling (`max_output_tokens` from metadata — e.g. 64K Sonnet, 128K Opus). Billing is on tokens generated, so this costs nothing extra and avoids mid-response truncation. Set it only to *cap* below the ceiling.

**Exception:** structured output (`outputSchema`) on non-streaming finalization clamps to ~21K (SDK timeout). Stream if you need higher. Truncation under the default logs a warning when [debug logging](../advanced/debug-logging) is on.

### Thinking (extended)

```typescript ignore
modelOptions: {
  thinking: {
    type: "enabled",
    budget_tokens: 2048,
  },
}
```

`budget_tokens` must be less than `modelOptions.max_tokens`.

### Adaptive thinking (Claude 4.6+, Sonnet 5, Fable 5)

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

| Models | Rules |
| --- | --- |
| `claude-sonnet-5`, `claude-opus-4-8`, `claude-opus-4-7` | Adaptive only; `{ type: "enabled", budget_tokens }` → 400. Sampling params rejected/removed |
| `claude-fable-5` | Thinking always on; only `{ type: "adaptive" }`. Sampling rejected |
| `claude-opus-4-6` / `claude-sonnet-4-6` | Adaptive + deprecated budget shape; sampling still OK |
| `display` | Default `"omitted"` on Opus 4.7+ and 5-gen — set `"summarized"` for reasoning text |
| `effort` | `"low"` \| `"medium"` \| `"high"` \| `"xhigh"` \| `"max"`; `"xhigh"` on Opus 4.7+, Sonnet 5, Fable 5 |

### Prompt caching

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

## API reference

Short factories read `ANTHROPIC_API_KEY`; `create*` takes an explicit key. Model is always first arg.

| Factory | Purpose |
| --- | --- |
| `anthropicText` / `createAnthropicChat` | Chat |
| `anthropicSummarize` / `createAnthropicSummarize` | Summarization |

- `model` — e.g. `"claude-sonnet-5"`, `"claude-fable-5"`, `"claude-opus-4-8"`
- `config?.baseURL` — optional

## Notes

- **No image generation** — use OpenAI or Gemini.

## Provider tools

Import from `@tanstack/ai-anthropic/tools`. Full matrix: [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

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

All registered Claude models. Scope with `allowed_domains` or `blocked_domains` (mutually exclusive).

### `webFetchTool`

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

Sonnet 4.x+.

### `codeExecutionTool`

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

Sonnet 4.x+. Hosted skills as second arg:

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

See [Provider Skills](../tools/provider-skills.md).

### `computerUseTool`

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

Sonnet 3.5+.

### `bashTool`

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

Sonnet 3.5+.

### `textEditorTool`

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

Sonnet 3.5+.

### `memoryTool`

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

Sonnet 4.x+.

### `customTool`

Inline JSON Schema tool (plain `Tool`, any chat model):

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

## Next steps

- [Getting Started](../getting-started/quick-start)
- [Tools Guide](../tools/tools)
- [Other Adapters](./openai)
