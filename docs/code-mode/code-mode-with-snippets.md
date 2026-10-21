---
title: Code Mode with Snippets
id: code-mode-with-snippets
order: 3
description: "Let Code Mode save working code as named snippets in storage, then call them again on later requests."
keywords:
  - tanstack ai
  - code mode
  - snippets
  - snippet library
  - register_snippet
  - reusable snippets
  - agent memory
  - snippet storage
---

Your model writes the same [Code Mode](./code-mode.md) program again on every request. For example, it writes a function that fetches and ranks npm packages, then writes it again next time.

Snippets let the model save working code under a name. On later requests, the saved snippets load from storage, and the model calls them as tools.

> [!NOTE]
> These snippets are runtime code that the chat model saves. To teach your coding assistant (Claude Code, Cursor) how TanStack AI works, see [Agent Skills (TanStack Intent)](../getting-started/agent-skills).

## Quick setup

You need the route from the [Code Mode quick setup](./code-mode#quick-setup) first.

1. Install the snippets package:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-code-mode-snippets
vue: @tanstack/ai-code-mode-snippets
solid: @tanstack/ai-code-mode-snippets
svelte: @tanstack/ai-code-mode-snippets
preact: @tanstack/ai-code-mode-snippets
angular: @tanstack/ai-code-mode-snippets
vanilla: @tanstack/ai-code-mode-snippets
octane: @tanstack/ai-code-mode-snippets

<!-- ::end:tabs -->

2. Replace `createCodeMode` in your route with `codeModeWithSnippets`. It needs a storage and a cheap model that picks the snippets for each request:

```typescript
// app/api/chat/route.ts (Next.js). Any route that takes a Request works.
import {
  chat,
  chatParamsFromRequest,
  convertMessagesToModelMessages,
  maxIterations,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { codeModeWithSnippets } from '@tanstack/ai-code-mode-snippets'
import { createFileSnippetStorage } from '@tanstack/ai-code-mode-snippets/storage'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const fetchWeather = toolDefinition({
  name: 'fetchWeather',
  description: 'Get current weather for a city',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({ temperature: z.number(), condition: z.string() }),
}).server(async ({ location }) => ({
  temperature: location.length + 10,
  condition: 'sunny',
}))

const storage = createFileSnippetStorage({ directory: './.snippets' })
const driver = createNodeIsolateDriver()

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const { toolsRegistry, systemPrompt } = await codeModeWithSnippets({
    config: { driver, tools: [fetchWeather] },
    adapter: openaiText('gpt-5.4-mini'), // cheap model that picks snippets
    snippets: { storage, maxSnippetsInContext: 5 },
    messages: convertMessagesToModelMessages(messages),
  })

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'), // strong model for the real work
    systemPrompts: ['You are a helpful weather assistant.', systemPrompt],
    tools: toolsRegistry.getTools(),
    messages,
    threadId,
    runId,
    agentLoopStrategy: maxIterations(15),
  })

  return toServerSentEventsResponse(stream)
}
```

3. Send "Compare the weather in Tokyo and Paris. Save the code as a snippet."

4. Look in `./.snippets/`. It holds a new folder with `code.ts` and `meta.json`.

5. Start a new chat and ask the same kind of question. The cheap model picks the saved snippet, and the main model calls it as a tool instead of writing the code again.

## How it works

Each request goes through these steps:

1. `codeModeWithSnippets` loads the snippet index. The index holds names and descriptions, with no code.
2. The cheap model reads the last 5 messages and the index, then picks the snippets that match.
3. The registry gets the Code Mode tool, the snippet management tools, and one tool for each picked snippet.
4. The strong model in `chat()` can call a snippet tool, write new code with `execute_typescript`, or save new code with `register_snippet`.

If storage is empty or there are no messages, step 2 makes no model call.

The registry holds these tools:

- `execute_typescript`: the Code Mode sandbox. Inside it, every saved snippet is also a `snippet_<name>` function.
- `search_snippets`: searches the library by query and returns the snippet metadata.
- `get_snippet`: returns one snippet in full, code included.
- `register_snippet`: saves working code as a new snippet.
- One tool for each picked snippet. Its description starts with `[SNIPPET]`.

A new snippet is callable inside `execute_typescript` right away, as `snippet_<name>`. It shows up as a direct tool on the next request.

## Pick a storage

- **`createFileSnippetStorage`:** saves snippets to disk. It imports `node:fs` and `node:path`, so it is only on the `@tanstack/ai-code-mode-snippets/storage` subpath. Use it on Node.
- **`createMemorySnippetStorage`:** keeps snippets in memory. It has no `node:fs` dependency, so the package root exports it, and it runs in Workers and browsers. Use it for tests, demos, and the edge.

```typescript
import { createMemorySnippetStorage } from '@tanstack/ai-code-mode-snippets'

const storage = createMemorySnippetStorage()
```

The memory storage is also on the `/storage` subpath.

## Advanced

### Pick the snippets yourself

`codeModeWithSnippets` asks a model to pick snippets. To skip that model call, load the snippets yourself and build the tools with the lower-level functions. The `ts-code-mode-web` example uses this approach.

This example loads every snippet. It uses the `fetchWeather` tool from the quick setup, moved to `./tools`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import {
  createAlwaysTrustedStrategy,
  createSnippetManagementTools,
  createSnippetsSystemPrompt,
  snippetsToTools,
} from '@tanstack/ai-code-mode-snippets'
import { createFileSnippetStorage } from '@tanstack/ai-code-mode-snippets/storage'
import { openaiText } from '@tanstack/ai-openai'
import { fetchWeather } from './tools'

const trustStrategy = createAlwaysTrustedStrategy()
const storage = createFileSnippetStorage({
  directory: './.snippets',
  trustStrategy,
})
const driver = createNodeIsolateDriver()

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  // 1. The Code Mode tool and prompt
  const { tool: codeModeTool, systemPrompt: codeModePrompt } = createCodeMode({
    driver,
    tools: [fetchWeather],
  })

  // 2. Load every snippet and turn each one into a tool
  const allSnippets = await storage.loadAll()
  const snippetIndex = await storage.loadIndex()
  const snippetTools = snippetsToTools({
    snippets: allSnippets,
    driver,
    tools: [fetchWeather],
    storage,
  })

  // 3. The search, get, and register tools
  const managementTools = createSnippetManagementTools({
    storage,
    trustStrategy,
  })

  // 4. The prompt that documents the snippet library
  const snippetsPrompt = createSnippetsSystemPrompt({
    selectedSnippets: allSnippets,
    totalSnippetCount: snippetIndex.length,
    snippetsAsTools: true,
  })

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    tools: [codeModeTool, ...managementTools, ...snippetTools],
    messages,
    threadId,
    runId,
    systemPrompts: ['You are a helpful assistant.', codeModePrompt, snippetsPrompt],
    agentLoopStrategy: maxIterations(15),
  })

  return toServerSentEventsResponse(stream)
}
```

`snippetsToTools` also takes `timeout` (default `30000`) and `memoryLimit` (default `128`).

### What `codeModeWithSnippets` takes and returns

Options:

| Option | Type | Description |
|--------|------|-------------|
| `config` | `CodeModeToolConfig` | The same options as [`createCodeMode`](./code-mode#createcodemode-options). |
| `adapter` | text adapter | The model that picks snippets. A cheap, fast model is enough. |
| `snippets.storage` | `SnippetStorage` | Where snippets live. |
| `snippets.maxSnippetsInContext` | `number` | Most snippets to load for one request. Default: `5`. |
| `messages` | `Array<ModelMessage>` | The conversation, for snippet selection. |
| `snippetsAsTools` | `boolean` | Exposes picked snippets as direct tools. Default: `true`. |

Return value:

| Property | Type | Description |
|----------|------|-------------|
| `toolsRegistry` | `ToolRegistry` | All the tools. Give them to `chat()` with `tools: toolsRegistry.getTools()`. |
| `systemPrompt` | `string` | The Code Mode prompt plus the snippet library docs. |
| `selectedSnippets` | `Array<Snippet>` | The snippets that the selection model picked. |

### How selection works

On each request, `selectRelevantSnippets`:

1. Takes the last 5 messages.
2. Builds a catalog from the index: name, description, and the first usage hint of each snippet.
3. Asks the adapter for a JSON array of matching snippet names, with at most `maxSnippetsInContext` names.
4. Loads the full snippets for those names.

If the model returns invalid JSON, the selection is empty. The request continues with no preloaded snippets, and the model can still search and use snippets with the management tools.

### Snippets as tools or as sandbox functions

`snippetsAsTools` (default `true`) controls how the model calls a picked snippet:

| Mode | How the model calls a snippet | Good | Less good |
|------|-------------------------------|------|-----------|
| As tools (`true`) | A direct tool call to the snippet | Simpler for the model. Shows in the tool-call UI. Validates the input. | One tool per snippet in the tool list. |
| As sandbox functions (`false`) | `await snippet_fetch_data({ ... })` inside `execute_typescript` | Snippets combine in code. Fewer top-level tools. | The model must write code to use them. |

With `true`, the system prompt documents each snippet with its schema, usage hints, and an example call. With `false`, snippets appear as typed `snippet_*` functions in the sandbox type stubs.

### Snippet lifecycle

**Saving.** After useful code runs in `execute_typescript`, the system prompt tells the model to call `register_snippet` with these fields:

- `name`: a snake_case name. It becomes the tool name.
- `description`: what the snippet does.
- `code`: TypeScript that reads an `input` variable.
- `inputSchema` and `outputSchema`: JSON Schema strings.
- `usageHints`: when to use the snippet.
- `dependsOn`: other snippets that this one calls.

**Running.** When the model calls a snippet tool:

1. The snippet code gets `const input = <serialized input>;` in front of it.
2. The TypeScript syntax is stripped.
3. A fresh sandbox context starts with the `external_*` bindings.
4. The code runs and returns its result.
5. The success or failure count updates in the background.

With `codeModeWithSnippets`, code in `execute_typescript` can call both `external_*` and `snippet_*` functions. The code of a snippet tool gets only the `external_*` functions.

### Storage

Both storages implement `SnippetStorage`:

| Method | Description |
|--------|-------------|
| `loadIndex()` | Loads the metadata of all snippets, with no code. |
| `loadAll()` | Loads all snippets, code included. |
| `get(name)` | Gets one snippet by name. |
| `save(snippet)` | Creates or updates a snippet. |
| `delete(name)` | Removes a snippet. |
| `search(query, options?)` | Searches snippets by text. |
| `updateStats(name, success)` | Records one execution result, for trust tracking. |

The file storage writes this layout:

```text
.snippets/
  _index.json              # Small catalog for fast loading
  fetch_github_stats/
    meta.json              # Description, schemas, hints, stats
    code.ts                # TypeScript source
  compare_npm_packages/
    meta.json
    code.ts
```

`createFileSnippetStorage` takes `directory` and an optional `trustStrategy` (default: `createDefaultTrustStrategy()`).

### Trust strategies

A snippet starts untrusted and earns trust with successful runs. The trust level is metadata only. It does not block a run.

```typescript group=code-mode-with-snippets
import {
  createDefaultTrustStrategy,
  createAlwaysTrustedStrategy,
  createRelaxedTrustStrategy,
  createCustomTrustStrategy,
} from '@tanstack/ai-code-mode-snippets'
```

| Strategy | Starts at | Provisional | Trusted |
|----------|-----------|-------------|---------|
| Default | `untrusted` | 10+ runs, 90%+ success | 100+ runs, 95%+ success |
| Relaxed | `untrusted` | 3+ runs, 80%+ success | 10+ runs, 90%+ success |
| Always trusted | `trusted` | n/a | n/a |
| Custom | You choose | You choose | You choose |

```typescript group=code-mode-with-snippets
const strategy = createCustomTrustStrategy({
  initialLevel: 'untrusted',
  provisionalThreshold: { executions: 5, successRate: 0.85 },
  trustedThreshold: { executions: 50, successRate: 0.95 },
})
```

### Custom events

Snippets send these events, next to the [Code Mode events](./code-mode#custom-events). [Showing Code Mode in the UI](./client-integration) shows how to catch them.

| Event | When | Payload |
|-------|------|---------|
| `code_mode:snippet_call` | A snippet tool starts | `{ snippet, input, timestamp }` |
| `code_mode:snippet_result` | A snippet tool succeeds | `{ snippet, result, duration, timestamp }` |
| `code_mode:snippet_error` | A snippet tool fails | `{ snippet, error, duration, timestamp }` |
| `snippet:registered` | `register_snippet` saves a new snippet | `{ id, name, description, timestamp }` |

### Tips

- **Use a cheap model for selection.** It only matches snippet names to the conversation. `gpt-5.4-mini` or `claude-haiku-5-5` are enough.
- **Start with no snippets.** Get Code Mode working first. When your tools produce patterns that repeat, add snippets.
- **Watch the snippet count.** When the library grows, increase `maxSnippetsInContext`, or pick the snippets yourself.
