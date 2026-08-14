---
title: Code Mode with Snippets
id: code-mode-with-snippets
order: 3
description: "Teach Code Mode to save and reuse working code as named snippets backed by persistent storage — faster follow-up requests and composable agent memory."
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

Snippets extend [Code Mode](./code-mode.md) with a persistent library of reusable TypeScript snippets. When the LLM writes a useful piece of code — say, a function that fetches and ranks NPM packages — it can save that code as a _snippet_. On future requests, relevant snippets are loaded from storage and made available as first-class tools the LLM can call without re-writing the logic.

> **Different from agent-authoring skills.** The snippets on this page are _runtime_ snippets the chat LLM saves and reuses. If you're looking to teach your coding assistant (Claude Code, Cursor, etc.) how TanStack AI itself works, see [Agent Skills (TanStack Intent)](../getting-started/agent-skills).

## Overview

The snippets system has two integration paths:

| Approach | Entry point | Snippet selection | Best for |
|----------|-------------|----------------|----------|
| **High-level** | `codeModeWithSnippets()` | Automatic (LLM-based) | New projects, turnkey setup |
| **Manual** | Individual functions (`snippetsToTools`, `createSnippetManagementTools`, etc.) | You decide which snippets to load | Full control, existing setups |

Both paths share the same storage, trust, and execution primitives — they differ only in how snippets are selected and assembled.

## How It Works

A request with snippets enabled goes through these stages:

```
┌─────────────────────────────────────────────────────┐
│ 1. Load snippet index (metadata only, no code)        │
├─────────────────────────────────────────────────────┤
│ 2. Select relevant snippets (LLM call — fast model)   │
├─────────────────────────────────────────────────────┤
│ 3. Build tool registry                              │
│    ├── execute_typescript (Code Mode sandbox)        │
│    ├── search_snippets / get_snippet / register_snippet   │
│    └── snippet tools (one per selected snippet)         │
├─────────────────────────────────────────────────────┤
│ 4. Generate system prompt                           │
│    ├── Code Mode type stubs                         │
│    └── Snippet library documentation                  │
├─────────────────────────────────────────────────────┤
│ 5. Main chat() call (strong model)                  │
│    ├── Can call snippet tools directly                │
│    ├── Can write code via execute_typescript         │
│    └── Can register new snippets for future use       │
└─────────────────────────────────────────────────────┘
```

### LLM calls

There are **two** LLM interactions per request when using the high-level API:

1. **Snippet selection** (`selectRelevantSnippets`) — A single chat call using the adapter you provide. It sends the last 5 conversation messages plus a catalog of snippet names/descriptions, and asks the model to return a JSON array of relevant snippet names. This should be a cheap/fast model (e.g., `gpt-4o-mini`, `claude-haiku-4-5`).

2. **Main chat** — The primary `chat()` call with your full model. This is where the LLM reasons, calls tools, writes code, and registers snippets.

The selection call is lightweight — it only sees snippet metadata (names, descriptions, usage hints), not full code. If there are no snippets in storage or no messages, it short-circuits and skips the LLM call entirely.

## High-Level API: `codeModeWithSnippets()`

### Installation

```bash
pnpm add @tanstack/ai-code-mode-snippets
```

### Usage

```typescript
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { codeModeWithSnippets } from '@tanstack/ai-code-mode-snippets'
import { createFileSnippetStorage } from '@tanstack/ai-code-mode-snippets/storage'
import { openaiText } from '@tanstack/ai-openai'
import { myTool1, myTool2 } from './tools'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const storage = createFileSnippetStorage({ directory: './.snippets' })
const driver = createNodeIsolateDriver()

const { toolsRegistry, systemPrompt, selectedSnippets } = await codeModeWithSnippets({
  config: {
    driver,
    tools: [myTool1, myTool2],
    timeout: 60_000,
    memoryLimit: 128,
  },
  adapter: openaiText('gpt-5-mini'),  // cheap model for snippet selection
  snippets: {
    storage,
    maxSnippetsInContext: 5,
  },
  messages,  // current conversation
})

const stream = chat({
  adapter: openaiText('gpt-5.5'),  // strong model for reasoning
  tools: toolsRegistry.getTools(),
  messages,
  systemPrompts: ['You are a helpful assistant.', systemPrompt],
  agentLoopStrategy: maxIterations(15),
})
```

`codeModeWithSnippets` returns:

| Property | Type | Description |
|----------|------|-------------|
| `toolsRegistry` | `ToolRegistry` | Mutable registry containing all tools. Pass to `chat()` via `tools: toolsRegistry.getTools()`. |
| `systemPrompt` | `string` | Combined Code Mode + snippet library documentation. |
| `selectedSnippets` | `Array<Snippet>` | Snippets the selection model chose for this conversation. |

### What goes into the registry

The registry is populated with:

- **`execute_typescript`** — The Code Mode sandbox tool. Inside the sandbox, snippets are also available as `snippet_*` functions (loaded dynamically at execution time).
- **`search_snippets`** — Search the snippet library by query. Returns matching snippet metadata.
- **`get_snippet`** — Retrieve full details (including code) for a specific snippet.
- **`register_snippet`** — Save working code as a new snippet. Newly registered snippets are immediately added to the registry as callable tools.
- **One tool per selected snippet** — Each selected snippet becomes a direct tool (prefixed with `[SNIPPET]` in its description) that the LLM can call without going through `execute_typescript`.

## Manual API

If you want full control — for example, loading all snippets instead of using LLM-based selection — use the lower-level functions directly. This is the approach used in the `ts-code-mode-web` example.

```typescript
import { chat, maxIterations } from '@tanstack/ai'
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
import { myTool1, myTool2, BASE_PROMPT } from './tools'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const trustStrategy = createAlwaysTrustedStrategy()
const storage = createFileSnippetStorage({
  directory: './.snippets',
  trustStrategy,
})
const driver = createNodeIsolateDriver()

// 1. Create Code Mode tool + prompt
const { tool: codeModeTool, systemPrompt: codeModePrompt } =
  createCodeMode({
    driver,
    tools: [myTool1, myTool2],
    timeout: 60_000,
    memoryLimit: 128,
  })

// 2. Load all snippets and convert to tools
const allSnippets = await storage.loadAll()
const snippetIndex = await storage.loadIndex()

const snippetTools = allSnippets.length > 0
  ? snippetsToTools({
      snippets: allSnippets,
      driver,
      tools: [myTool1, myTool2],
      storage,
      timeout: 60_000,
      memoryLimit: 128,
    })
  : []

// 3. Create management tools
const managementTools = createSnippetManagementTools({
  storage,
  trustStrategy,
})

// 4. Generate snippet library prompt
const snippetsPrompt = createSnippetsSystemPrompt({
  selectedSnippets: allSnippets,
  totalSnippetCount: snippetIndex.length,
  snippetsAsTools: true,
})

// 5. Assemble and call chat()
const stream = chat({
  adapter: openaiText('gpt-5.5'),
  tools: [codeModeTool, ...managementTools, ...snippetTools],
  messages,
  systemPrompts: [BASE_PROMPT, codeModePrompt, snippetsPrompt],
  agentLoopStrategy: maxIterations(15),
})
```

This approach skips the selection LLM call entirely — you load whichever snippets you want and pass them in directly.

## Snippet Storage

Snippets are persisted through the `SnippetStorage` interface. Two implementations are provided:

### File storage (production)

`createFileSnippetStorage` is Node-only — it imports `node:fs` / `node:path` — so
it lives behind the `/storage` subpath rather than the package root. This keeps
the root export safe to bundle for Cloudflare Workers and browser builds; only
reach for the subpath in a Node runtime.

```typescript
import { createFileSnippetStorage } from '@tanstack/ai-code-mode-snippets/storage'
import { createDefaultTrustStrategy } from '@tanstack/ai-code-mode-snippets'

const trustStrategy = createDefaultTrustStrategy()
const storage = createFileSnippetStorage({
  directory: './.snippets',
  trustStrategy,  // optional, defaults to createDefaultTrustStrategy()
})
```

Creates a directory structure:

```
.snippets/
  _index.json              # Lightweight catalog for fast loading
  fetch_github_stats/
    meta.json              # Description, schemas, hints, stats
    code.ts                # TypeScript source
  compare_npm_packages/
    meta.json
    code.ts
```

### Memory storage (testing & edge runtimes)

```typescript
import { createMemorySnippetStorage } from '@tanstack/ai-code-mode-snippets'

const storage = createMemorySnippetStorage()
```

Keeps everything in memory — no `node:fs` dependency, so it is re-exported from
the package root and is safe to use in Workers and browsers. Useful for tests,
demos, and edge deployments. (It is also available from the `/storage` subpath.)

### Storage interface

Both implementations satisfy this interface:

| Method | Description |
|--------|-------------|
| `loadIndex()` | Load lightweight metadata for all snippets (no code) |
| `loadAll()` | Load all snippets with full details including code |
| `get(name)` | Get a single snippet by name |
| `save(snippet)` | Create or update a snippet |
| `delete(name)` | Remove a snippet |
| `search(query, options?)` | Search snippets by text query |
| `updateStats(name, success)` | Record an execution result for trust tracking |

## Trust Strategies

Snippets start untrusted and earn trust through successful executions. The trust level is metadata only — it does not currently gate execution. Four built-in strategies are available:

```typescript group=code-mode-with-snippets
import {
  createDefaultTrustStrategy,
  createAlwaysTrustedStrategy,
  createRelaxedTrustStrategy,
  createCustomTrustStrategy,
} from '@tanstack/ai-code-mode-snippets'
```

| Strategy | Initial level | Provisional | Trusted |
|----------|--------------|-------------|---------|
| **Default** | `untrusted` | 10+ runs, ≥90% success | 100+ runs, ≥95% success |
| **Relaxed** | `untrusted` | 3+ runs, ≥80% success | 10+ runs, ≥90% success |
| **Always trusted** | `trusted` | — | — |
| **Custom** | Configurable | Configurable | Configurable |

```typescript group=code-mode-with-snippets
const strategy = createCustomTrustStrategy({
  initialLevel: 'untrusted',
  provisionalThreshold: { executions: 5, successRate: 0.85 },
  trustedThreshold: { executions: 50, successRate: 0.95 },
})
```

## Snippet Lifecycle

### Registration

When the LLM produces useful code via `execute_typescript`, the system prompt instructs it to call `register_snippet` with:

- `name` — snake_case identifier (becomes the tool name)
- `description` — what the snippet does
- `code` — TypeScript source that receives an `input` variable
- `inputSchema` / `outputSchema` — JSON Schema strings
- `usageHints` — when to use this snippet
- `dependsOn` — other snippets this one calls

The snippet is saved to storage and (if a `ToolRegistry` was provided) immediately added as a callable tool in the current session.

### Execution

When a snippet tool is called, the system:

1. Wraps the snippet code with `const input = <serialized input>;`
2. Strips TypeScript syntax to plain JavaScript
3. Creates a fresh sandbox context with `external_*` bindings
4. Executes the code and returns the result
5. Updates execution stats (success/failure count) asynchronously

### Selection (high-level API only)

On each new request, `selectRelevantSnippets`:

1. Takes the last 5 conversation messages as context
2. Builds a catalog from the snippet index (name + description + first usage hint)
3. Asks the adapter to return a JSON array of relevant snippet names (max `maxSnippetsInContext`)
4. Loads full snippet data for the selected names

If parsing fails or the model returns invalid JSON, it falls back to an empty selection — the request proceeds without pre-loaded snippets, but the LLM can still search and use snippets via the management tools.

## Snippets as Tools vs. Sandbox Bindings

The `snippetsAsTools` option (default: `true`) controls how snippets are exposed:

| Mode | How the LLM calls a snippet | Pros | Cons |
|------|--------------------------|------|------|
| **As tools** (`true`) | Direct tool call: `snippet_name({ ... })` | Simpler for the LLM, shows in tool-call UI, proper input validation | One tool per snippet in the tool list |
| **As bindings** (`false`) | Inside `execute_typescript`: `await snippet_fetch_data({ ... })` | Snippets composable in code, fewer top-level tools | LLM must write code to use them |

When `snippetsAsTools` is enabled, the system prompt documents each snippet with its schema, usage hints, and example calls. When disabled, snippets appear as typed `snippet_*` functions in the sandbox type stubs.

## Custom Events

Snippet execution emits events through the TanStack AI event system:

| Event | When | Payload |
|-------|------|---------|
| `code_mode:snippet_call` | Snippet tool invoked | `{ snippet, input, timestamp }` |
| `code_mode:snippet_result` | Snippet completed successfully | `{ snippet, result, duration, timestamp }` |
| `code_mode:snippet_error` | Snippet execution failed | `{ snippet, error, duration, timestamp }` |
| `snippet:registered` | New snippet saved via `register_snippet` | `{ id, name, description, timestamp }` |

To render these events in your React app alongside Code Mode execution events, see [Showing Code Mode in the UI](./client-integration).

## Tips

- **Use a cheap model for selection.** The selection call only needs to match snippet names to conversation context — `gpt-4o-mini` or `claude-haiku-4-5` work well.
- **Start without snippets.** Get Code Mode working first, then add `@tanstack/ai-code-mode-snippets` once you have tools that produce reusable patterns.
- **Monitor the snippet count.** As the library grows, consider increasing `maxSnippetsInContext` or switching to the manual API where you control which snippets load.
- **Newly registered snippets are available on the next message,** not in the current turn's tool list (unless using `ToolRegistry` with the high-level API, which adds them immediately).
- **Snippets can call other snippets.** Inside the sandbox, both `external_*` and `snippet_*` functions are available. Set `dependsOn` when registering to document these relationships.

## Next Steps

- [Code Mode](./code-mode) — Core Code Mode setup and API reference
- [Showing Code Mode in the UI](./client-integration) — Display execution progress in your React app
- [Isolate Drivers](./code-mode-isolates) — Compare sandbox runtimes
