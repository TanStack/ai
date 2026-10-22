---
title: Provider Tools
id: provider-tools
order: 2
description: "Use the built-in tools of a provider, such as web search, code execution, and computer use. Import the factory from the /tools subpath of the adapter and add it to chat()."
---

A provider tool runs on the provider's servers. Use it for web search or code execution that you do not host.

Import the factory of the provider tool from the `/tools` subpath of your adapter, and add it to `chat({ tools })`. The provider runs the tool. TypeScript stops you if the model does not support that tool.

## Add a provider tool

### 1. Import the factory

Each adapter has its provider tools on a `/tools` subpath:

```typescript
import { webSearchTool } from '@tanstack/ai-anthropic/tools'
import { codeInterpreterTool } from '@tanstack/ai-openai/tools'
import { googleSearchTool } from '@tanstack/ai-gemini/tools'
```

### 2. Add it to `chat({ tools })`

This route gives Claude web search, with at most 3 searches for each request:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { webSearchTool } from '@tanstack/ai-anthropic/tools'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: anthropicText('claude-opus-5-5'),
    messages,
    threadId,
    runId,
    tools: [
      webSearchTool({
        name: 'web_search',
        type: 'web_search_20250305',
        max_uses: 3,
      }),
    ],
  })

  return toServerSentEventsResponse(stream)
}
```

### 3. Try it

Ask your chat "Summarize today's AI news." The model searches the web on Anthropic's servers and answers with what it found. You wrote no search code.

## How it works

- The factory marks the tool as a native tool of the provider. The adapter sends it in the format of the provider.
- The provider runs the tool on its own servers. The result comes back inside the assistant turn, not as a separate tool message.
- The call shows up as a provider-executed `tool-call` part. The agent loop never tries to run it in your app.
- Each factory returns a typed `ProviderTool`. If the model does not support the tool, TypeScript shows an error on that item of the `tools` array.

## Available tools

| Provider | Tools |
|---|---|
| Anthropic | `webSearchTool`, `webFetchTool`, `codeExecutionTool`, `computerUseTool`, `bashTool`, `textEditorTool`, `memoryTool`. See [Anthropic adapter](../adapters/anthropic.md#provider-tools). |
| OpenAI | `webSearchTool`, `webSearchPreviewTool`, `fileSearchTool`, `imageGenerationTool`, `codeInterpreterTool`, `mcpTool`, `computerUseTool`, `localShellTool`, `shellTool`, `applyPatchTool`. See [OpenAI adapter](../adapters/openai.md#provider-tools). |
| Gemini | `codeExecutionTool`, `fileSearchTool`, `googleSearchTool`, `googleSearchRetrievalTool`, `googleMapsTool`, `urlContextTool`, `computerUseTool`. See [Gemini adapter](../adapters/gemini.md#provider-tools). |
| OpenRouter | `webSearchTool`, `webFetchTool`. See [OpenRouter adapter](../adapters/openrouter.md#provider-tools). |
| Grok | `grokWebSearchTool`, `grokXSearchTool`, `grokFileSearchTool`, `grokMCPTool`. See [Grok adapter](../adapters/grok.md#provider-tools). |
| Groq | Function tools only. No provider tools. |

Anthropic and OpenAI can also load hosted skills into their code sandbox. See [Provider Skills](./provider-skills.md).

## Which models support which tools?

The `supports.tools` array of each model in `model-meta.ts` is the source of truth:

- **Anthropic**: every registered model supports all tools, except `claude-opus-5-fast`, which supports none.
  - For `computerUseTool`, each model takes only some versions. The Claude 5.5 models take only `computer_toolset_20260801`. See the version table in [`computerUseTool`](../adapters/anthropic-advanced.md#computerusetool).
- **OpenAI**:
  - GPT-6.1 Sol, the GPT-5 family, and the reasoning models (O-series) support all tools.
  - GPT-6 Astra, Sol, and Luna support every tool except `webSearchPreviewTool` and `localShellTool`.
  - The GPT-4 series supports web, file, image, code, and MCP tools, but not the preview or shell tools.
  - GPT-3.5 and the audio models support none.
- **Gemini**: the 3.x Pro and Flash models support all tools. The Lite, image, and video models support fewer.
- **OpenRouter**: every chat model supports `webSearchTool` and `webFetchTool` through the gateway.

For the exact list of a model, open the adapter page, or read the `supports.tools` array of the model in `model-meta.ts`.

## Advanced

### Provider tools next to your own tools

If the names are different, you can put a factory tool and your own function in the same `tools` array.

- The factory selects the native behavior, not the name. A plain function named `web_search`, `google_search`, or `code_execution` stays a custom function.
- Do not build `{ name: 'web_search', metadata: ... }` by hand. You do not get a native tool that way.
- Tool names in one `tools` array must be unique. If you pass `webSearchTool()` and your own function named `web_search`, `chat()` throws `DuplicateToolNameError` before it calls the provider.

### Results stay in the conversation

Provider tool results, such as Anthropic `web_search` sources and `web_fetch` page contents, stay on the assistant message. When you send the earlier conversation into the next `chat()` call, the model still sees them. You do not need extra code:

```typescript
import { chat, StreamProcessor } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { webSearchTool } from '@tanstack/ai-anthropic/tools'

const adapter = anthropicText('claude-opus-5-5')
const tools = [webSearchTool({ name: 'web_search', type: 'web_search_20250305' })]

const processor = new StreamProcessor()
for await (const chunk of chat({
  adapter,
  tools,
  messages: [{ role: 'user', content: 'Find two sources on the drone market.' }],
  threadId: 'thread-1',
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
  threadId: 'thread-1',
})
```

### Show web search sources

OpenAI and Gemini web search calls put a `metadata.sources` array on the assistant `tool-call` part. Each source has a `url`, and it can also have a `title` or a `pageAge`. Use the list to show source links:

```typescript
import { getProviderExecutedMetadata } from '@tanstack/ai'
import type { UIMessage } from '@tanstack/ai'

function logSources(message: UIMessage) {
  for (const part of message.parts) {
    if (part.type !== 'tool-call') continue
    const sources = getProviderExecutedMetadata(part)?.sources ?? []
    for (const source of sources) {
      console.log(source.title ?? source.url, source.url)
    }
  }
}
```

The provider runs the search, so do not run this tool call in your app. The raw provider response stays in `metadata.openai` or `metadata.gemini`.

### Tools that your app runs

These OpenAI tools work the other way: the model returns the call, and your app runs it.

- `applyPatchTool`
- `localShellTool`
- `computerUseTool`
- `shellTool({ environment: { type: "local" } })`

See [OpenAI: Advanced](../adapters/openai-advanced.md#applypatchtool) and [`computerUseTool`](../adapters/openai-advanced.md#computerusetool).

To run computer use actions on a browser or a desktop without your own action code, use `createComputerUse` from `@tanstack/ai-computer-use`. The same `tools` work with OpenAI and Anthropic, and each thread gets its own machine. See [Computer use](../computer-use/computer-use.md).

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

declare const threadId: string

const computerUse = createComputerUse({
  driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Find the TanStack AI docs' }],
  threadId,
  tools: computerUse.tools,
  middleware: [computerUse.middleware],
  interrupts: [computerUse.interrupt],
})
```

### How the type guard works

- Each provider tool factory, such as `webSearchTool` or `computerUseTool`, returns a `ProviderTool<TProvider, TKind>` brand.
- The `toolCapabilities` of the adapter come from the `supports.tools` list of each model. They decide which brands you can put in `tools`.
- Put `computerUseTool(...)` on a model that does not support it, and TypeScript shows an error on that array item. The error is not on the factory call, and it is not at runtime.
- Your `toolDefinition()` tools have no brand, so every model accepts them.
- The `customTool` factories of `ai-anthropic` and `ai-openai` also return a plain `Tool`, not a `ProviderTool`. Every chat model accepts them too.

### Upgrade from 0.x

Did you use `createWebSearchTool` from `@tanstack/ai-openrouter`? See [Migration Guide section 5](../migration/migration.md#5-provider-tools-moved-to-tools).
