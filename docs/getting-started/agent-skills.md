---
title: Agent Skills (TanStack Intent)
id: agent-skills
order: 6
description: "Wire TanStack AI Agent Skills into Claude Code, Cursor, Copilot, and other coding agents via Intent."
keywords:
  - tanstack ai
  - tanstack intent
  - agent skills
  - claude code
  - cursor
  - github copilot
  - ai coding agents
  - SKILL.md
  - AGENTS.md
---

If you need your coding agent to use TanStack AI correctly → install packages, run `npx @tanstack/intent@latest install`, confirm the `intent-skills` block.

Runtime Code Mode skills are different → [Code Mode with Skills](../code-mode/code-mode-with-skills).

## 1. Install TanStack AI

```bash
pnpm add @tanstack/ai
```

Full walkthrough: [Quick Start](./quick-start).

## 2. Install Intent mappings

From the project root:

```bash
npx @tanstack/intent@latest install
```

## What you installed

Agent Skills are `SKILL.md` files in npm packages that tell coding agents which APIs and patterns to use. Supported by Claude Code, Cursor, Copilot, Codex, and others. They update with `npm update` instead of stale training data or hand-pasted docs.

| Package | Skill | Teaches |
|---------|-------|---------|
| `@tanstack/ai` | `ai-core` | Chat, tools, adapters, middleware, locks, structured output, media, AG-UI |
| `@tanstack/ai-persistence` | `ai-persistence` | Server chat state, store contracts, Drizzle/Prisma/D1 recipes |
| `@tanstack/ai-memory` | `tanstack-ai-memory` | `memoryMiddleware`, adapters (in-memory, Redis, …) |
| `@tanstack/ai-mcp` | `ai-mcp` | MCP servers, tools in `chat()`, CLI types |
| `@tanstack/ai-sandbox` | `ai-sandbox` | `defineSandbox` / `withSandbox` |
| `@tanstack/ai-code-mode` | `ai-code-mode` | Code Mode + sandbox driver + server tools |

Skills cross-link. Each skill ships with the package that owns the code (e.g. browser persistence under `ai-core`, not `@tanstack/ai-persistence`). Files live at `node_modules/<package>/skills/<skill-name>/SKILL.md`.

## 3. Review mappings

Install appends (or creates) an `intent-skills` block:

```yaml
<!-- intent-skills:start -->
# Skill mappings — when working in these areas, load the linked skill file into context.
skills:
  - task: "Building chat, tool calling, adapters, or streaming with TanStack AI"
    load: "node_modules/@tanstack/ai/skills/ai-core/SKILL.md"
  - task: "Persisting chat state or building a persistence adapter"
    load: "node_modules/@tanstack/ai-persistence/skills/ai-persistence/SKILL.md"
  - task: "Setting up Code Mode with TanStack AI"
    load: "node_modules/@tanstack/ai-code-mode/skills/ai-code-mode/SKILL.md"
<!-- intent-skills:end -->
```

Tighten `task:` lines so they match work you actually do — agents use them to decide when to load a skill.

## 4. Smoke-test the agent

New session; ask something like: _Add a streaming chat endpoint with `@tanstack/ai` and the OpenAI adapter._

Expect:

- `chat()`, not `streamText()`
- `openaiText()` from `@tanstack/ai-openai`, not `createOpenAI()`
- `toServerSentEventsResponse()` for SSE
- Middleware for lifecycle events (no `onFinish` on `chat()`)

Still wrong patterns → re-check the config file for `intent-skills` and clearer `task:` coverage.

## Keep skills current

`SKILL.md` updates when you bump the package — no re-run needed. Re-run Intent install only when you add a new intent-enabled package or want fresh task mappings.

## Without the CLI

Point the agent at the file directly:

```markdown
When working on TanStack AI code, read and follow:
node_modules/@tanstack/ai/skills/ai-core/SKILL.md
```

CLI is preferred for discovery and standard layout; paths above stay stable.

## Related

- [TanStack Intent docs](https://tanstack.com/intent/latest/docs/overview) — `scaffold`, `validate`, CI for library authors
- [Agent Skills registry](https://tanstack.com/intent/registry)
