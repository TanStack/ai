---
title: Code Mode with Skills
id: code-mode-with-skills
order: 3
description: "Teach Code Mode to save and reuse working code as named skills backed by persistent storage — faster follow-up requests and composable agent memory."
keywords:
  - tanstack ai
  - code mode
  - skills
  - skill library
  - register_skill
  - reusable snippets
  - agent memory
  - skill storage
---

Skills extend [Code Mode](./code-mode.md) with a persistent library of reusable TypeScript snippets. When the LLM writes a useful piece of code — say, a function that fetches and ranks NPM packages — it can save that code as a _skill_. On future requests, relevant skills are loaded from storage and made available as first-class tools the LLM can call without re-writing the logic.

> **Different from agent-authoring skills.** The skills on this page are _runtime_ snippets the chat LLM saves and reuses. If you're looking to teach your coding assistant (Claude Code, Cursor, etc.) how TanStack AI itself works, see [Agent Skills (TanStack Intent)](../getting-started/agent-skills).

## Overview

The skills system has two integration paths:

| Approach | Entry point | Skill selection | Best for |
|----------|-------------|----------------|----------|
| **High-level** | `codeModeWithSkills()` | Automatic (LLM-based) | New projects, turnkey setup |
| **Manual** | Individual functions (`skillsToTools`, `createSkillManagementTools`, etc.) | You decide which skills to load | Full control, existing setups |

Both paths share the same storage, trust, and execution primitives — they differ only in how skills are selected and assembled.

## How It Works

A request with skills enabled goes through these stages:

```
┌─────────────────────────────────────────────────────┐
│ 1. Load skill index (metadata only, no code)        │
├─────────────────────────────────────────────────────┤
│ 2. Select relevant skills (LLM call — fast model)   │
├─────────────────────────────────────────────────────┤
│ 3. Build tool registry                              │
│    ├── execute_typescript (Code Mode sandbox)        │
│    ├── search_skills / get_skill / register_skill   │
│    └── skill tools (one per selected skill)         │
├─────────────────────────────────────────────────────┤
│ 4. Generate system prompt                           │
│    ├── Code Mode type stubs                         │
│    └── Skill library documentation                  │
├─────────────────────────────────────────────────────┤
│ 5. Main chat() call (strong model)                  │
│    ├── Can call skill tools directly                │
│    ├── Can write code via execute_typescript         │
│    └── Can register new skills for future use       │
└─────────────────────────────────────────────────────┘
```

### LLM calls

There are **two** LLM interactions per request when using the high-level API:

1. **Skill selection** (`selectRelevantSkills`) — A single chat call using the adapter you provide. It sends the last 5 conversation messages plus a catalog of skill names/descriptions, and asks the model to return a JSON array of relevant skill names. This should be a cheap/fast model (e.g., `gpt-4o-mini`, `claude-haiku-4-5`).

2. **Main chat** — The primary `chat()` call with your full model. This is where the LLM reasons, calls tools, writes code, and registers skills.

The selection call is lightweight — it only sees skill metadata (names, descriptions, usage hints), not full code. If there are no skills in storage or no messages, it short-circuits and skips the LLM call entirely.

## High-Level API: `codeModeWithSkills()`

### Installation

```bash
pnpm add @tanstack/ai-code-mode-skills
```

### Usage

```typescript
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { codeModeWithSkills } from '@tanstack/ai-code-mode-skills'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
import { openaiText } from '@tanstack/ai-openai'

const storage = createFileSkillStorage({ directory: './.skills' })
const driver = createNodeIsolateDriver()

const { toolsRegistry, systemPrompt, selectedSkills } = await codeModeWithSkills({
  config: {
    driver,
    tools: [myTool1, myTool2],
    timeout: 60_000,
    memoryLimit: 128,
  },
  adapter: openaiText('gpt-4o-mini'),  // cheap model for skill selection
  skills: {
    storage,
    maxSkillsInContext: 5,
  },
  messages,  // current conversation
})

const stream = chat({
  adapter: openaiText('gpt-4o'),  // strong model for reasoning
  toolRegistry: toolsRegistry,
  messages,
  systemPrompts: ['You are a helpful assistant.', systemPrompt],
  agentLoopStrategy: maxIterations(15),
})
```

`codeModeWithSkills` returns:

| Property | Type | Description |
|----------|------|-------------|
| `toolsRegistry` | `ToolRegistry` | Mutable registry containing all tools. Pass to `chat()` via `toolRegistry`. |
| `systemPrompt` | `string` | Combined Code Mode + skill library documentation. |
| `selectedSkills` | `Array<Skill>` | Skills the selection model chose for this conversation. |

### What goes into the registry

The registry is populated with:

- **`execute_typescript`** — The Code Mode sandbox tool. Inside the sandbox, skills are also available as `skill_*` functions (loaded dynamically at execution time).
- **`search_skills`** — Search the skill library by query. Returns matching skill metadata.
- **`get_skill`** — Retrieve full details (including code) for a specific skill.
- **`register_skill`** — Save working code as a new skill. Newly registered skills are immediately added to the registry as callable tools.
- **One tool per selected skill** — Each selected skill becomes a direct tool (prefixed with `[SKILL]` in its description) that the LLM can call without going through `execute_typescript`.

## Manual API

If you want full control — for example, loading all skills instead of using LLM-based selection — use the lower-level functions directly. This is the approach used in the `ts-code-mode-web` example.

```typescript
import { chat, maxIterations } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import {
  createAlwaysTrustedStrategy,
  createSkillManagementTools,
  createSkillsSystemPrompt,
  skillsToTools,
} from '@tanstack/ai-code-mode-skills'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'

const trustStrategy = createAlwaysTrustedStrategy()
const storage = createFileSkillStorage({
  directory: './.skills',
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

// 2. Load all skills and convert to tools
const allSkills = await storage.loadAll()
const skillIndex = await storage.loadIndex()

const skillTools = allSkills.length > 0
  ? skillsToTools({
      skills: allSkills,
      driver,
      tools: [myTool1, myTool2],
      storage,
      timeout: 60_000,
      memoryLimit: 128,
    })
  : []

// 3. Create management tools
const managementTools = createSkillManagementTools({
  storage,
  trustStrategy,
})

// 4. Generate skill library prompt
const skillsPrompt = createSkillsSystemPrompt({
  selectedSkills: allSkills,
  totalSkillCount: skillIndex.length,
  skillsAsTools: true,
})

// 5. Assemble and call chat()
const stream = chat({
  adapter: openaiText('gpt-4o'),
  tools: [codeModeTool, ...managementTools, ...skillTools],
  messages,
  systemPrompts: [BASE_PROMPT, codeModePrompt, skillsPrompt],
  agentLoopStrategy: maxIterations(15),
})
```

This approach skips the selection LLM call entirely — you load whichever skills you want and pass them in directly.

## Skill Storage

Skills are persisted through the `SkillStorage` interface. Two implementations are provided:

### File storage (production)

```typescript
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'

const storage = createFileSkillStorage({
  directory: './.skills',
  trustStrategy,  // optional, defaults to createDefaultTrustStrategy()
})
```

Creates a directory structure:

```
.skills/
  _index.json              # Lightweight catalog for fast loading
  fetch_github_stats/
    meta.json              # Description, schemas, hints, stats
    code.ts                # TypeScript source
  compare_npm_packages/
    meta.json
    code.ts
```

### Memory storage (testing)

```typescript
import { createMemorySkillStorage } from '@tanstack/ai-code-mode-skills/storage'

const storage = createMemorySkillStorage()
```

Keeps everything in memory. Useful for tests and demos.

### Storage interface

Both implementations satisfy this interface:

| Method | Description |
|--------|-------------|
| `loadIndex()` | Load lightweight metadata for all skills (no code) |
| `loadAll()` | Load all skills with full details including code |
| `get(name)` | Get a single skill by name |
| `save(skill)` | Create or update a skill |
| `delete(name)` | Remove a skill |
| `search(query, options?)` | Search skills by text query |
| `updateStats(name, success)` | Record an execution result for trust tracking |

## Trust Strategies

Skills start untrusted and earn trust through successful executions. The trust level is metadata only — it does not currently gate execution. Four built-in strategies are available:

```typescript
import {
  createDefaultTrustStrategy,
  createAlwaysTrustedStrategy,
  createRelaxedTrustStrategy,
  createCustomTrustStrategy,
} from '@tanstack/ai-code-mode-skills'
```

| Strategy | Initial level | Provisional | Trusted |
|----------|--------------|-------------|---------|
| **Default** | `untrusted` | 10+ runs, ≥90% success | 100+ runs, ≥95% success |
| **Relaxed** | `untrusted` | 3+ runs, ≥80% success | 10+ runs, ≥90% success |
| **Always trusted** | `trusted` | — | — |
| **Custom** | Configurable | Configurable | Configurable |

```typescript
const strategy = createCustomTrustStrategy({
  initialLevel: 'untrusted',
  provisionalThreshold: { executions: 5, successRate: 0.85 },
  trustedThreshold: { executions: 50, successRate: 0.95 },
})
```

## Skill Lifecycle

### Registration

When the LLM produces useful code via `execute_typescript`, the system prompt instructs it to call `register_skill` with:

- `name` — snake_case identifier (becomes the tool name)
- `description` — what the skill does
- `code` — TypeScript source that receives an `input` variable
- `inputSchema` / `outputSchema` — JSON Schema strings
- `usageHints` — when to use this skill
- `dependsOn` — other skills this one calls

The skill is saved to storage and (if a `ToolRegistry` was provided) immediately added as a callable tool in the current session.

### Execution

When a skill tool is called, the system:

1. Wraps the skill code with `const input = <serialized input>;`
2. Strips TypeScript syntax to plain JavaScript
3. Creates a fresh sandbox context with `external_*` bindings
4. Executes the code and returns the result
5. Updates execution stats (success/failure count) asynchronously

### Selection (high-level API only)

On each new request, `selectRelevantSkills`:

1. Takes the last 5 conversation messages as context
2. Builds a catalog from the skill index (name + description + first usage hint)
3. Asks the adapter to return a JSON array of relevant skill names (max `maxSkillsInContext`)
4. Loads full skill data for the selected names

If parsing fails or the model returns invalid JSON, it falls back to an empty selection — the request proceeds without pre-loaded skills, but the LLM can still search and use skills via the management tools.

## Skills as Tools vs. Sandbox Bindings

The `skillsAsTools` option (default: `true`) controls how skills are exposed:

| Mode | How the LLM calls a skill | Pros | Cons |
|------|--------------------------|------|------|
| **As tools** (`true`) | Direct tool call: `skill_name({ ... })` | Simpler for the LLM, shows in tool-call UI, proper input validation | One tool per skill in the tool list |
| **As bindings** (`false`) | Inside `execute_typescript`: `await skill_fetch_data({ ... })` | Skills composable in code, fewer top-level tools | LLM must write code to use them |

When `skillsAsTools` is enabled, the system prompt documents each skill with its schema, usage hints, and example calls. When disabled, skills appear as typed `skill_*` functions in the sandbox type stubs.

## Custom Events

Skill execution emits events through the TanStack AI event system:

| Event | When | Payload |
|-------|------|---------|
| `code_mode:skill_call` | Skill tool invoked | `{ skill, input, timestamp }` |
| `code_mode:skill_result` | Skill completed successfully | `{ skill, result, duration, timestamp }` |
| `code_mode:skill_error` | Skill execution failed | `{ skill, error, duration, timestamp }` |
| `skill:registered` | New skill saved via `register_skill` | `{ id, name, description, timestamp }` |

To render these events in your React app alongside Code Mode execution events, see [Showing Code Mode in the UI](./client-integration).

## Tips

- **Use a cheap model for selection.** The selection call only needs to match skill names to conversation context — `gpt-4o-mini` or `claude-haiku-4-5` work well.
- **Start without skills.** Get Code Mode working first, then add `@tanstack/ai-code-mode-skills` once you have tools that produce reusable patterns.
- **Monitor the skill count.** As the library grows, consider increasing `maxSkillsInContext` or switching to the manual API where you control which skills load.
- **Newly registered skills are available on the next message,** not in the current turn's tool list (unless using `ToolRegistry` with the high-level API, which adds them immediately).
- **Skills can call other skills.** Inside the sandbox, both `external_*` and `skill_*` functions are available. Set `dependsOn` when registering to document these relationships.

## Next Steps

- [Code Mode](./code-mode) — Core Code Mode setup and API reference
- [Showing Code Mode in the UI](./client-integration) — Display execution progress in your React app
- [Isolate Drivers](./code-mode-isolates) — Compare sandbox runtimes
