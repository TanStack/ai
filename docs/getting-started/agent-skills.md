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

You're building with TanStack AI and using an AI coding agent — Claude Code, Cursor, GitHub Copilot, or similar. The agent keeps suggesting Vercel-AI-SDK patterns like `streamText()` or `createOpenAI()`, or it wires streams manually instead of using `toServerSentEventsResponse()`. By the end of this guide, your agent will load TanStack AI's bundled skills automatically whenever you work on AI code — and those skills will stay in sync with whichever `@tanstack/ai` version your project installs.

> **Looking for runtime skills inside Code Mode?** Those are a different feature — see [Code Mode with Skills](../code-mode/code-mode-with-skills). This page is about _agent-authoring_ skills: markdown files that teach your coding assistant how TanStack AI works.

## What are Agent Skills?

Agent Skills are markdown documents (`SKILL.md`) that ship inside npm packages and tell AI coding agents how to use a library correctly — which functions to use, which patterns to avoid, and when to reach for which module. The format is an open standard supported by Claude Code, Cursor, GitHub Copilot, Codex, and others.

TanStack AI publishes skills inside its packages so the guidance travels with `npm update` instead of being pinned in a model's training data or copy-pasted into `CLAUDE.md` manually.

## Skills Shipped by TanStack AI

| Package | Skill | What it teaches |
|---------|-------|-----------------|
| `@tanstack/ai` | `ai-core` | Chat experience, tool calling, adapters, middleware, structured outputs, media generation, AG-UI protocol, custom backends |
| `@tanstack/ai-code-mode` | `ai-code-mode` | Setting up Code Mode with a sandbox driver and registering server tools |

Each skill lives under `node_modules/<package>/skills/<skill-name>/SKILL.md` once the package is installed.

## Step 1: Install TanStack AI

If you haven't already, install `@tanstack/ai` plus any adapter packages you need. See the [Quick Start](./quick-start) for a full walkthrough.

```bash
pnpm add @tanstack/ai @tanstack/ai-openai
```

## Step 2: Run `intent install`

From the root of your project, run:

```bash
npx @tanstack/intent@latest install
```

The CLI walks your agent through the setup. It scans `node_modules` for every package that ships skills (any package with the `tanstack-intent` keyword), asks your agent to propose task-to-skill mappings that match your codebase, and writes them into your agent's config file.

By default the mappings land in `AGENTS.md`. The CLI can also target:

- `CLAUDE.md` — Claude Code
- `.cursorrules` — Cursor
- any other agent config file you point it at

## Step 3: Review the Generated Mappings

The install command appends (or creates) an `intent-skills` block that looks like this:

```yaml
<!-- intent-skills:start -->
# Skill mappings — when working in these areas, load the linked skill file into context.
skills:
  - task: "Building chat, tool calling, adapters, or streaming with TanStack AI"
    load: "node_modules/@tanstack/ai/skills/ai-core/SKILL.md"
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
