---
title: Provider Tools
id: provider-tools
order: 2
---

Most providers expose native tools beyond user-defined function calls: web
search, code execution, computer use, hosted retrieval, and more. TanStack AI
exports each provider's native tools from a dedicated `/tools` subpath per
adapter package.

You have an adapter already wired up. You want to give the model access to a
provider-native capability (e.g. Anthropic web search) and be sure you never
pair a tool with a model that doesn't support it. By the end of this page,
you'll have imported the factory, added it to `chat({ tools: [...] })`, and
understood the compile-time guard that will catch unsupported combinations.

## Import

Every adapter ships provider tools on a `/tools` subpath:

```typescript
import { webSearchTool } from '@tanstack/ai-anthropic/tools'
import { codeInterpreterTool } from '@tanstack/ai-openai/tools'
import { googleSearchTool } from '@tanstack/ai-gemini/tools'
```

## Use in `chat({ tools })`

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

Provider tools run on the provider's own infrastructure, so their results
(e.g. Anthropic `web_search` sources, `web_fetch` page contents) come back
embedded in the assistant turn rather than as a separate tool message. TanStack
AI preserves those results on the assistant message, so when you feed the prior
conversation back into the next `chat()` call the model still sees the earlier
evidence — no special handling required:

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

// The follow-up turn can still cite the previous search results.
const followUp = chat({
  adapter,
  tools,
  messages: [
    ...processor.getMessages(),
    { role: 'user', content: 'List the exact sources you used.' },
  ],
})
```

The search/fetch call surfaces as a provider-executed `tool-call` part on the
assistant message; the agent loop never tries to run it client-side.

## Type-level guard

Every provider-specific tool factory (e.g. `webSearchTool`, `computerUseTool`)
returns a `ProviderTool<TProvider, TKind>` brand. The adapter's
`toolCapabilities` (derived from each model's `supports.tools` list) gates
which brands are assignable to `tools`.

Paste a `computerUseTool(...)` into a model that doesn't expose it, and
TypeScript reports an error on that array element — not on the factory call,
not at runtime. User-defined `toolDefinition()` tools stay unbranded and
always assignable. The `customTool` factories exported from `ai-anthropic` and
`ai-openai` also return a plain `Tool` (not a `ProviderTool` brand) and are
therefore universally accepted by any chat model, just like `toolDefinition()`.

## Available tools

| Provider | Tools |
|---|---|
| Anthropic | `webSearchTool`, `webFetchTool`, `codeExecutionTool`, `computerUseTool`, `bashTool`, `textEditorTool`, `memoryTool` — see [Anthropic adapter](../adapters/anthropic.md#provider-tools). |
| OpenAI | `webSearchTool`, `webSearchPreviewTool`, `fileSearchTool`, `imageGenerationTool`, `codeInterpreterTool`, `mcpTool`, `computerUseTool`, `localShellTool`, `shellTool`, `applyPatchTool` — see [OpenAI adapter](../adapters/openai.md#provider-tools). |
| Gemini | `codeExecutionTool`, `fileSearchTool`, `googleSearchTool`, `googleSearchRetrievalTool`, `googleMapsTool`, `urlContextTool`, `computerUseTool` — see [Gemini adapter](../adapters/gemini.md#provider-tools). |
| OpenRouter | `webSearchTool`, `webFetchTool` — see [OpenRouter adapter](../adapters/openrouter.md#provider-tools). |
| Grok | function tools only (no provider-specific tools). |
| Groq | function tools only (no provider-specific tools). |

## Which models support which tools?

Each adapter's `supports.tools` array is the source of truth. The comparison
matrix is maintained alongside `model-meta.ts` and reflected here:

- **Anthropic**: every registered model supports the full tool superset
  (the retired Claude 3.x models with narrower support were removed).
- **OpenAI**: GPT-5 family and reasoning models (O-series) support the full
  superset. GPT-4-series supports web/file/image/code/mcp but not
  preview/shell variants. GPT-3.5 and audio-focused models: none.
- **Gemini**: 3.x Pro/Flash models support the full tool set. Lite and
  image/video variants have narrower support.
- **OpenRouter**: every chat model supports `webSearchTool` and
  `webFetchTool` via the gateway.

For the exact per-model list, open the adapter page or read the model's
`supports.tools` array directly from `model-meta.ts`.

## Provider Skills

Anthropic and OpenAI support hosted, provider-managed skill bundles that run
inside the provider's server-side sandbox. Skills attach to an execution tool
(`codeExecutionTool` for Anthropic, `shellTool` for OpenAI) and are referenced
by ID — the provider handles installation and execution.

See [Provider Skills](./provider-skills.md) for full setup steps and examples.

## Migrating from earlier versions

If you were using `createWebSearchTool` from `@tanstack/ai-openrouter`, see
[Migration Guide §6](../migration/migration.md#6-provider-tools-moved-to-tools-subpath).
