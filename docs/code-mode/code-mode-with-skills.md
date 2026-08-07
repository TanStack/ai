---
title: Code Mode with Skills
id: code-mode-with-skills
order: 3
description: "Save and reuse TypeScript snippets as skills — storage, selection, register_skill, trust."
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

# Code Mode with Skills

If Code Mode works and you want reusable snippets → skills: the model saves working code and reloads it on later requests.

> Runtime skills (this page) ≠ [Agent Skills / TanStack Intent](../getting-started/agent-skills) for coding assistants.

## Paths

| Approach | Entry | Selection | When |
|----------|-------|-----------|------|
| High-level | `codeModeWithSkills()` | Auto (cheap LLM) | New projects |
| Manual | `skillsToTools`, etc. | You load skills | Full control |

## Request flow (high-level)

1. Load skill index (metadata only)
2. Select relevant skills (cheap model)
3. Build registry: `execute_typescript` + management tools + selected skill tools
4. System prompt = Code Mode stubs + skill docs
5. Main `chat()` with strong model

**Two LLM calls:** selection (metadata, last 5 messages) + main chat. Empty storage/messages short-circuits selection.

## High-level: `codeModeWithSkills()`

### 1. Install

```bash
pnpm add @tanstack/ai-code-mode-skills
```

### 2. Wire

```typescript
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { codeModeWithSkills } from '@tanstack/ai-code-mode-skills'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
import { openaiText } from '@tanstack/ai-openai'
import { myTool1, myTool2 } from './tools'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const storage = createFileSkillStorage({ directory: './.skills' })
const driver = createNodeIsolateDriver()

const { toolsRegistry, systemPrompt, selectedSkills } =
  await codeModeWithSkills({
    config: {
      driver,
      tools: [myTool1, myTool2],
      timeout: 60_000,
      memoryLimit: 128,
    },
    adapter: openaiText('gpt-5-mini'), // selection
    skills: {
      storage,
      maxSkillsInContext: 5,
    },
    messages,
  })

const stream = chat({
  adapter: openaiText('gpt-5.5'), // main
  tools: toolsRegistry.getTools(),
  messages,
  systemPrompts: ['You are a helpful assistant.', systemPrompt],
  agentLoopStrategy: maxIterations(15),
})
```

| Property | Type | Description |
|----------|------|-------------|
| `toolsRegistry` | `ToolRegistry` | `tools: toolsRegistry.getTools()` |
| `systemPrompt` | `string` | Code Mode + skill docs |
| `selectedSkills` | `Array<Skill>` | Chosen for this turn |

**Registry contents:** `execute_typescript` · `search_skills` · `get_skill` · `register_skill` · one tool per selected skill (`[SKILL]` prefix). Skills also bind as `skill_*` inside the sandbox.

## Manual API

Skip selection LLM; load what you want (as in `ts-code-mode-web`):

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
import { openaiText } from '@tanstack/ai-openai'
import { myTool1, myTool2, BASE_PROMPT } from './tools'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const trustStrategy = createAlwaysTrustedStrategy()
const storage = createFileSkillStorage({
  directory: './.skills',
  trustStrategy,
})
const driver = createNodeIsolateDriver()

const { tool: codeModeTool, systemPrompt: codeModePrompt } = createCodeMode({
  driver,
  tools: [myTool1, myTool2],
  timeout: 60_000,
  memoryLimit: 128,
})

const allSkills = await storage.loadAll()
const skillIndex = await storage.loadIndex()

const skillTools =
  allSkills.length > 0
    ? skillsToTools({
        skills: allSkills,
        driver,
        tools: [myTool1, myTool2],
        storage,
        timeout: 60_000,
        memoryLimit: 128,
      })
    : []

const managementTools = createSkillManagementTools({
  storage,
  trustStrategy,
})

const skillsPrompt = createSkillsSystemPrompt({
  selectedSkills: allSkills,
  totalSkillCount: skillIndex.length,
  skillsAsTools: true,
})

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  tools: [codeModeTool, ...managementTools, ...skillTools],
  messages,
  systemPrompts: [BASE_PROMPT, codeModePrompt, skillsPrompt],
  agentLoopStrategy: maxIterations(15),
})
```

## Storage

### File (Node only — `/storage` subpath)

```typescript
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
import { createDefaultTrustStrategy } from '@tanstack/ai-code-mode-skills'

const storage = createFileSkillStorage({
  directory: './.skills',
  trustStrategy: createDefaultTrustStrategy(),
})
```

Layout: `_index.json` + per-skill `meta.json` / `code.ts`.

### Memory (tests / edge / Workers)

```typescript
import { createMemorySkillStorage } from '@tanstack/ai-code-mode-skills'

const storage = createMemorySkillStorage()
```

### Interface

| Method | Description |
|--------|-------------|
| `loadIndex()` / `loadAll()` / `get(name)` | Read |
| `save(skill)` / `delete(name)` | Write |
| `search(query, options?)` | Text search |
| `updateStats(name, success)` | Trust stats |

## Trust strategies

Metadata only — does not gate execution.

| Strategy | Initial | Provisional | Trusted |
|----------|---------|-------------|---------|
| Default | `untrusted` | 10+ runs, ≥90% | 100+ runs, ≥95% |
| Relaxed | `untrusted` | 3+ / ≥80% | 10+ / ≥90% |
| Always trusted | `trusted` | — | — |
| Custom | configurable | configurable | configurable |

```typescript group=code-mode-with-skills
import {
  createDefaultTrustStrategy,
  createAlwaysTrustedStrategy,
  createRelaxedTrustStrategy,
  createCustomTrustStrategy,
} from '@tanstack/ai-code-mode-skills'

const strategy = createCustomTrustStrategy({
  initialLevel: 'untrusted',
  provisionalThreshold: { executions: 5, successRate: 0.85 },
  trustedThreshold: { executions: 50, successRate: 0.95 },
})
```

## Lifecycle

**Register** via `register_skill`: `name`, `description`, `code`, schemas, `usageHints`, `dependsOn`. High-level registry adds the tool immediately.

**Execute:** wrap input → strip TS → sandbox with `external_*` → return → async stats.

**Select (high-level):** last 5 messages + catalog → JSON names (max `maxSkillsInContext`) → load full skills. Parse failure → empty selection; management tools still work.

## Skills as tools vs bindings

| Mode | Call style | Tradeoff |
|------|------------|----------|
| `skillsAsTools: true` (default) | Direct tool call | Simpler UI; more tools |
| `false` | Inside `execute_typescript` as `skill_*` | Composable in code; fewer top-level tools |

## Events

| Event | When |
|-------|------|
| `code_mode:skill_call` / `:skill_result` / `:skill_error` | Skill tool lifecycle |
| `skill:registered` | New skill saved |

Render with Code Mode events: [Client integration](./client-integration).

## Tips

1. Cheap model for selection (`gpt-4o-mini`, `claude-haiku-4-5`).
2. Get Code Mode working before adding skills.
3. Watch library size — raise `maxSkillsInContext` or use manual API.
4. Skills can call `external_*` and `skill_*`; set `dependsOn` when registering.

## Next

- [Code Mode](./code-mode) · [Client UI](./client-integration) · [Isolates](./code-mode-isolates)
