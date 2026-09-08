---
name: tanstack-ai
description: >
  Entry point for TanStack AI, the type-safe TypeScript AI SDK (@tanstack/ai and
  its adapters). Use when a project builds chat, streaming, tool calling, agents,
  structured outputs, embeddings, or media generation with TanStack AI, when
  someone asks which TanStack AI package to install, or before writing any
  TanStack AI code. Routes to tanstack-ai-providers, tanstack-ai-clients,
  tanstack-ai-agents, tanstack-ai-state, and tanstack-ai-migration, then hands
  off to the installed package's own SKILL.md. Triggers on "TanStack AI",
  "@tanstack/ai", "chat()", "useChat", "toolDefinition", "which adapter".
---

# TanStack AI

TanStack AI is a type-safe, provider-agnostic TypeScript AI SDK. `@tanstack/ai`
holds the server-side core: `chat()`, `embed()`, `summarize()`, `rerank()`,
the `generate*()` media functions, `toolDefinition()`, and the middleware
pipeline. Provider
adapters, framework hooks, and every other capability ship as separate packages.

- Docs: https://tanstack.com/ai/latest/docs
- Repository: https://github.com/TanStack/ai

## Do not write TanStack AI code from memory

The SDK moves fast, and your training data holds APIs from other SDKs. TanStack
AI is not the Vercel AI SDK: there is no `streamText`, no `createOpenAI`, no
`onFinish` callback. If you write those names here, you are guessing.

Resolve every API against the installed version, in this order:

1. The package's own skill: `node_modules/<package>/skills/<skill>/SKILL.md`.
2. The package source: published packages ship `src`, so read
   `node_modules/<package>/src/`.
3. https://tanstack.com/ai/latest/docs.

If none of the three supports an answer, say so. Do not fill the hole from
memory.

## 1. Read the project

```bash
ls node_modules/@tanstack 2>/dev/null
```

That is what the app has. `package.json` shows the intended stack, and the
lockfile shows which package manager to use.

## 2. Route the need

| The user wants to... | Read |
| --- | --- |
| Pick a model provider, gateway, or model id | `tanstack-ai-providers` |
| Build the UI: hooks, chat components, devtools | `tanstack-ai-clients` |
| Tool calling, MCP, code mode, sandboxes, coding-agent harnesses, memory | `tanstack-ai-agents` |
| Persist chat state, resume streams, compact context | `tanstack-ai-state` |
| Port an app from another SDK, or upgrade a deprecated API | `tanstack-ai-migration` |

Server chat, streaming, tools, structured outputs, and media generation all live
in `@tanstack/ai` itself. Its `ai-core` skill covers them, and routes to its own
sub-skills.

[`packages.md`](./packages.md) lists every published package and the skills it
ships.

## 3. Install what the task needs

Use the project's package manager. Install `@tanstack/ai` plus the packages the
task actually needs, and do not pin a version: skills travel with the package,
so the current release carries the current guidance.

```bash
pnpm add @tanstack/ai @tanstack/ai-openai   # npm install / yarn add / bun add
```

## 4. Hand off to the package's own skill

```bash
cat node_modules/@tanstack/ai/skills/ai-core/SKILL.md
```

Follow it. Entry skills route to sub-skills, such as `ai-core/tool-calling` or
`ai-persistence/build-drizzle-adapter`. Follow those too, rather than answering
from this map.

## 5. Check the install is current

The installed skill is the truth for the installed version. When a skill has no
answer for the surface being asked about, compare the versions before you
improvise:

```bash
node -p "require('@tanstack/ai/package.json').version"
npm view @tanstack/ai version
```

If the install is behind, say which version the app has, then recommend the
upgrade. Anything newer belongs to a version the app does not have yet.

## Give the skills to the whole team

A plugin install is per user. To put these skills in the repo, and to reach
agents with no plugin marketplace:

```bash
npx skills add TanStack/ai                  # copies these skills into the repo
npx @tanstack/intent@latest install         # maps tasks to installed packages' skills
```
