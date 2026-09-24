<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-anthropic

Anthropic Claude adapter for TanStack AI chat, tool calling, thinking, and structured outputs

## Installation

```bash
npm install @tanstack/ai-anthropic
# or
pnpm add @tanstack/ai-anthropic
# or
yarn add @tanstack/ai-anthropic
```

## Setup

Set your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

### Text/Chat Adapter

```typescript
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const stream = chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

### With Explicit API Key

```typescript
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const adapter = createAnthropicChat(
  'claude-sonnet-4-6',
  process.env.ANTHROPIC_API_KEY!,
  {
    baseURL: 'https://api.anthropic.com', // optional, for custom endpoints
  },
)
```

### With Tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { z } from 'zod'

const searchDatabase = toolDefinition({
  name: 'search_database',
  description: 'Search the database',
  inputSchema: z.object({ query: z.string() }),
}).server(async ({ query }) => {
  return { results: [] }
})

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    tools: [searchDatabase],
  })

  return toServerSentEventsResponse(stream)
}
```

### Thinking

Newer Claude models use adaptive thinking — the model decides when and how much to think, and depth is tuned with `output_config.effort`:

```typescript
const stream = chat({
  adapter: anthropicText('claude-sonnet-5'),
  messages: [{ role: 'user', content: 'Plan a database migration.' }],
  modelOptions: {
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: 'xhigh' },
    max_tokens: 64_000,
  },
})
```

Claude 4.6 models also accept the manual `{ type: 'enabled', budget_tokens }` shape; `budget_tokens` must be less than `max_tokens`. Which shapes and sampling parameters each model accepts is enforced by the adapter's types — see the docs for the per-model rules.

### Prompt Caching

Mark a content part with `cache_control` to cache it:

```typescript
const stream = chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          content: 'What is the capital of France?',
          metadata: { cache_control: { type: 'ephemeral' } },
        },
      ],
    },
  ],
})
```

### Summarization

```typescript
import { summarize } from '@tanstack/ai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'

const result = await summarize({
  adapter: anthropicSummarize('claude-sonnet-4-6'),
  text: 'Your long text to summarize...',
  maxLength: 100,
  style: 'concise', // "concise" | "bullet-points" | "paragraph"
})

console.log(result.summary)
```

### Provider Tools

Anthropic's native tools live on `@tanstack/ai-anthropic/tools` and go into `chat({ tools })` alongside your own: `webSearchTool`, `webFetchTool`, `codeExecutionTool`, `computerUseTool`, `bashTool`, `textEditorTool`, `memoryTool`, and `customTool`.

```typescript
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { webSearchTool } from '@tanstack/ai-anthropic/tools'

const stream = chat({
  adapter: anthropicText('claude-opus-4-7'),
  messages: [{ role: 'user', content: "What's new in AI this week?" }],
  tools: [
    webSearchTool({
      name: 'web_search',
      type: 'web_search_20250305',
      max_uses: 2,
    }),
  ],
})
```

### Claude on Vertex AI

Install `@anthropic-ai/vertex-sdk` next to this package and import from `@tanstack/ai-anthropic/vertex`:

```typescript
import { chat } from '@tanstack/ai'
import { anthropicVertexText } from '@tanstack/ai-anthropic/vertex'

const stream = chat({
  adapter: anthropicVertexText('claude-sonnet-5', {
    project: 'my-project',
    location: 'europe-west1',
  }),
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

`location` is required (on the factory or via `GOOGLE_CLOUD_LOCATION`, `GOOGLE_VERTEX_LOCATION`, or `CLOUD_ML_REGION`); `project` can come from Application Default Credentials. Only the Claude models in the Vertex catalog are accepted.

## Features

- ✅ Streaming chat
- ✅ Function/tool calling and Anthropic's native provider tools
- ✅ Extended and adaptive thinking
- ✅ Structured output
- ✅ Prompt caching
- ✅ Summarization (`anthropicSummarize`)
- ✅ Claude on Vertex AI (`@tanstack/ai-anthropic/vertex`)

## Documentation

- [Anthropic adapter](https://tanstack.com/ai/latest/docs/adapters/anthropic): configuration, per-model thinking rules, every provider tool, and the API reference
- [Provider Tools](https://tanstack.com/ai/latest/docs/tools/provider-tools): the concept, comparison matrix, and which models support which tools

## License

MIT
