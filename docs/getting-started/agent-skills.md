---
title: Agent Skills (TanStack Intent)
id: agent-skills
order: 6
description: "Use TanStack Intent to wire TanStack AI's bundled Agent Skills into Claude Code, Cursor, GitHub Copilot, and other AI coding assistants."
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
> **Looking for runtime snippets inside Code Mode?** Those are a different feature, see [Code Mode with Snippets](../code-mode/code-mode-with-snippets). This page is about _agent-authoring_ skills: markdown files that teach your coding assistant how TanStack AI works.

> **Want your app's model to load `SKILL.md` skills at runtime?** That is a
> different feature with a confusingly similar name. See
> [Portable Agent Skills](../skills/agent-skills): a runtime catalog plus a
> `load_skill` tool, for the model inside your app. This page is only about
> teaching your _coding assistant_ how to use TanStack AI.
## Step 1: Install TanStack AI

If you haven't already, install `@tanstack/ai` plus any adapter packages you need. See the [Quick Start](./quick-start) for a full walkthrough.

```bash
pnpm add @tanstack/ai
```

## Step 2: Run `intent install`

From the root of your project, run:

```bash
npx @tanstack/intent@latest install
```


## What are Agent Skills?

Agent Skills are markdown documents (`SKILL.md`) that ship inside npm packages and tell AI coding agents how to use a library correctly — which functions to use, which patterns to avoid, and when to reach for which module. The format is an open standard supported by Claude Code, Cursor, GitHub Copilot, Codex, and others.

TanStack AI publishes skills inside its packages so the guidance travels with `npm update` instead of being pinned in a model's training data or copy-pasted into `CLAUDE.md` manually.

## Skills Shipped by TanStack AI

| Package | Skill | What it teaches |
|---------|-------|-----------------|
| `@tanstack/ai` | `ai-core` | Chat experience, browser persistence on `useChat`, tool calling, adapters, middleware, locks, structured outputs, media generation, AG-UI protocol, custom backends |
| `@tanstack/ai-persistence` | `ai-persistence` | Server chat state (`withPersistence`), the store contracts, and per-stack recipes that write a `chat-persistence.ts` into your app against your existing Drizzle, Prisma, or Cloudflare D1 setup |
| `@tanstack/ai-memory` | `tanstack-ai-memory` | `memoryMiddleware`, the recall/save adapter contract, and the in-memory / Redis / Hindsight / Mem0 / Honcho adapters |
| `@tanstack/ai-mcp` | `ai-mcp` | Connecting to MCP servers, running their tools inside `chat()`, resources, prompts, and the type-generating CLI |
| `@tanstack/ai-sandbox` | `ai-sandbox` | Running harness adapters inside isolated sandboxes with `defineSandbox` / `withSandbox` |
| `@tanstack/ai-code-mode` | `ai-code-mode` | Setting up Code Mode with a sandbox driver and registering server tools |
| `@tanstack/ai-skills` | `ai-skills` | Portable Agent Skills at runtime: the `withSkills` middleware, `load_skill`, the `SkillSource` interface, `inlineSkill` / `skillDirectory` / `staticSkills`, and adding your own tools for skills that carry code |
| `@tanstack/ai-cli` | `ai-cli` | Driving the `ts-ai` CLI from a terminal or agent harness — JSON/stream output, exit codes, `--config`, `--output-dir`, `introspect`, and `mcp` |

Skills route to each other: `ai-core` points at the companion packages'
skills, and `ai-persistence` is an entry point that routes to its own
sub-skills (`server`, `stores`, and the
`build-{drizzle,prisma,cloudflare,custom}-adapter` recipes) under
`skills/ai-persistence/`, same nesting style as `ai-core`. Multi-instance locks
ship with the code they teach, so `ai-core/locks` lives in `@tanstack/ai`
alongside `withLocks`.

Each skill ships with the code it teaches. Browser persistence lives in the
framework packages, so `ai-core/client-persistence` is in `@tanstack/ai` rather
than in `@tanstack/ai-persistence` — an app that persists only in the browser
never installs the server package.

Each skill lives under `node_modules/<package>/skills/<skill-name>/SKILL.md` once the package is installed.


## Step 3: Review the Generated Mappings

The install command appends (or creates) an `intent-skills` block that looks like this:

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

Check that the `task:` descriptions match areas you actually work in. Tighten or reword them if needed — they're how your agent decides when to pull the skill into context.

## Step 4: Confirm It's Wired Up

Open a fresh session in your coding agent and ask it to build something with TanStack AI — for example: _"Add a streaming chat endpoint using `@tanstack/ai` and the OpenAI adapter."_

You should see:

- The agent uses `chat()`, not `streamText()`.
- The adapter is imported as `openaiText()` from `@tanstack/ai-openai`, not `createOpenAI()`.
- The response is wrapped with `toServerSentEventsResponse()` instead of manual SSE wiring.
- Middleware is used for lifecycle events (no `onFinish` callback on `chat()`).

If the agent still falls back to other-SDK patterns, re-open its config file and confirm the `intent-skills` block is present and the `task:` descriptions clearly cover the area you're asking about.

## Keeping Skills Current

Skills are versioned with the package. When you bump `@tanstack/ai`, the `SKILL.md` files under `node_modules` update with it — no CLI re-run needed. Re-run `npx @tanstack/intent@latest install` only when you _add_ a new intent-enabled package (for example, adding `@tanstack/ai-code-mode` later) or want to refresh the task mappings.

## Using Skills Without the CLI

If you'd rather wire skills in yourself, you can reference them directly from `node_modules` in any agent config file. The minimum your agent needs is a pointer to the file:

```markdown
When working on TanStack AI code, read and follow:
node_modules/@tanstack/ai/skills/ai-core/SKILL.md
```

The CLI is recommended because it discovers packages automatically and stays consistent with the agent-skills standard, but the underlying file paths are stable.

## Learn More

- [TanStack Intent documentation](https://tanstack.com/intent/latest/docs/overview) — the CLI's full reference, including `scaffold`, `validate`, and CI setup for library maintainers.
- [Agent Skills registry](https://tanstack.com/intent/registry) — browse other intent-enabled packages.
