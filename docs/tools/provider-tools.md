---
title: Provider Tools
id: provider-tools
order: 2
description: "Import provider-native tools from adapter /tools subpaths and pass them to chat({ tools })."
---

If you need a provider-native capability (web search, code interpreter, …) → import from that adapter's `/tools` subpath and add it to `chat({ tools })`.

## 1. Import

```typescript
import { webSearchTool } from '@tanstack/ai-anthropic/tools'
import { codeInterpreterTool } from '@tanstack/ai-openai/tools'
import { googleSearchTool } from '@tanstack/ai-gemini/tools'
```

## 2. Pass to `chat`

```typescript
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { webSearchTool } from '@tanstack/ai-anthropic/tools'

const stream = chat({
  adapter: anthropicText('claude-opus-4-6'),
  messages: [{ role: 'user', content: "Summarize today's AI news." }],
  tools: [
    webSearchTool({
      name: 'web_search',
      type: 'web_search_20250305',
      max_uses: 3,
    }),
  ],
})
```

## Multi-turn persistence

Provider tools run on provider infrastructure. Results stay on the assistant turn (not a separate tool message). Feed prior messages back into the next `chat()` — no special handling:

```typescript
import { chat, StreamProcessor } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { webSearchTool } from '@tanstack/ai-anthropic/tools'

const adapter = anthropicText('claude-opus-4-6')
const tools = [webSearchTool({ name: 'web_search', type: 'web_search_20250305' })]

const processor = new StreamProcessor()
for await (const chunk of chat({
  adapter,
  tools,
  messages: [{ role: 'user', content: 'Find two sources on the drone market.' }],
})) {
  processor.processChunk(chunk)
}
processor.finalizeStream()

const followUp = chat({
  adapter,
  tools,
  messages: [
    ...processor.getMessages(),
    { role: 'user', content: 'List the exact sources you used.' },
  ],
})
```

Surfaces as a provider-executed `tool-call` part on the assistant message — agent loop never runs it client-side.

## Type-level guard

Factories return `ProviderTool<TProvider, TKind>`. The adapter's `toolCapabilities` (from `supports.tools`) gates assignability to `tools`.

Paste an unsupported tool → TypeScript errors on that array element. User-defined `toolDefinition()` tools and `customTool` factories stay unbranded and always assignable.

## Available tools

| Provider | Tools |
|---|---|
| Anthropic | `webSearchTool`, `webFetchTool`, `codeExecutionTool`, `computerUseTool`, `bashTool`, `textEditorTool`, `memoryTool` — [Anthropic adapter](../adapters/anthropic.md#provider-tools) |
| OpenAI | `webSearchTool`, `webSearchPreviewTool`, `fileSearchTool`, `imageGenerationTool`, `codeInterpreterTool`, `mcpTool`, `computerUseTool`, `localShellTool`, `shellTool`, `applyPatchTool` — [OpenAI adapter](../adapters/openai.md#provider-tools) |
| Gemini | `codeExecutionTool`, `fileSearchTool`, `googleSearchTool`, `googleSearchRetrievalTool`, `googleMapsTool`, `urlContextTool`, `computerUseTool` — [Gemini adapter](../adapters/gemini.md#provider-tools) |
| OpenRouter | `webSearchTool`, `webFetchTool` — [OpenRouter adapter](../adapters/openrouter.md#provider-tools) |
| Grok / Groq | Function tools only |

## Model support (source of truth: `supports.tools`)

- **Anthropic** — full tool superset on every registered model
- **OpenAI** — GPT-5 + O-series full; GPT-4 web/file/image/code/mcp; GPT-3.5 / audio: none
- **Gemini** — 3.x Pro/Flash full; Lite / media variants narrower
- **OpenRouter** — every chat model supports `webSearchTool` + `webFetchTool`

Exact lists: adapter page or `model-meta.ts`.

## Provider Skills

Hosted skill bundles attach to an execution tool (`codeExecutionTool` / `shellTool`). See [Provider Skills](./provider-skills.md).

## Migrating

Old `createWebSearchTool` from `@tanstack/ai-openrouter` → [Migration Guide §6](../migration/migration.md#6-provider-tools-moved-to-tools-subpath).
