---
title: Agent Skills (TanStack Intent)
id: agent-skills
order: 6
description: "Teach your coding agent to write correct TanStack AI code. Install the Agent Skills as a Claude Code or Cursor plugin, with npx skills, or with TanStack Intent."
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
  - claude code plugin
  - cursor plugin
  - plugin marketplace
  - npx skills
---

Install the TanStack AI agent skill so your coding agent writes current TanStack AI code.

TanStack AI ships Agent Skills: `SKILL.md` files that teach your coding agent how the library works. They come with the package version you install, so the agent reads guidance that matches your code. This takes about 5 minutes.

> [!NOTE]
> This page is about your coding assistant. For other features with a similar name, see:
>
> - [Portable Agent Skills](../skills/agent-skills): the model inside your app loads `SKILL.md` skills at runtime.
> - [Code Mode with Snippets](../code-mode/code-mode-with-snippets): runtime snippets inside Code Mode.

## 1. Install the discovery skills

Install these once. Every project that you open then has them.

In Claude Code or Cursor, add the repo as a plugin marketplace:

```bash
/plugin marketplace add TanStack/ai
/plugin install tanstack-ai
```

With any agent, use the Agent Skills CLI:

```bash
npx skills add TanStack/ai -g --skill tanstack-ai tanstack-ai-migration
```

## 2. Install TanStack AI

Install `@tanstack/ai` in your project, plus the adapters you need. The [Quick Start](./quick-start) shows the full setup.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai
vue: @tanstack/ai
solid: @tanstack/ai
svelte: @tanstack/ai
preact: @tanstack/ai
angular: @tanstack/ai
vanilla: @tanstack/ai
octane: @tanstack/ai

<!-- ::end:tabs -->

## 3. Run `intent install`

From the root of your project, run:

```bash
npx @tanstack/intent@latest install
```

This adds an `intent-skills` block to your agent config file. It tells the agent which skill to load for which task. Commit it, and your whole team gets the same setup.

## 4. Try it

Open a new session in your coding agent. Ask it to build something with TanStack AI, for example: _"Add a streaming chat endpoint using `@tanstack/ai` and the OpenAI adapter."_

The agent now writes TanStack AI code:

- It uses `chat()`, not `streamText()`.
- It imports `openaiText()` from `@tanstack/ai-openai`, not `createOpenAI()`.
- It returns the stream with `toServerSentEventsResponse()`, not with hand-written SSE.
- It uses middleware for lifecycle events. `chat()` has no `onFinish` callback.

If the agent still writes code for another SDK, open its config file. Make sure that the `intent-skills` block is there, and that the `task:` descriptions cover the area you asked about.

## How it works

There are two kinds of skills:

- **Discovery skills** (step 1) live at the user level. They tell the agent when to use TanStack AI, which package covers a task, and how to install it. They hold no API guidance.
- **Package skills** ship inside each npm package. After a package is installed, the discovery skills hand off to `npx @tanstack/intent@latest load <package>#<skill>`. So the agent reads the guidance for the version you installed.

Agent Skills are an open standard. Claude Code, Cursor, GitHub Copilot, Codex, and other agents support it. The guidance updates with `npm update`, so you do not copy it into `CLAUDE.md` by hand.

## Advanced

### Discovery skills

| Skill | Answers |
| --- | --- |
| `tanstack-ai` | Whether to use TanStack AI, which package covers a task, how to install and wire it |
| `tanstack-ai-migration` | Porting from the Vercel AI SDK, upgrading from 0.x to 1.0 |

### Package skills

The discovery skills route into these. Each one teaches the version that the app has installed.

| Package | Skill | What it teaches |
| --- | --- | --- |
| `@tanstack/ai` | `ai-core` | Chat experience, browser persistence on `useChat`, tool calling, adapters, middleware, locks, structured outputs, media generation, AG-UI protocol, custom backends |
| `@tanstack/ai-persistence` | `ai-persistence` | Server chat state (`withPersistence`), the store contracts, and recipes for each stack that write a `chat-persistence.ts` into your app against your Drizzle, Prisma, or Cloudflare D1 setup |
| `@tanstack/ai-memory` | `tanstack-ai-memory` | `memoryMiddleware`, the recall/save adapter contract, and the in-memory, Redis, Hindsight, Mem0, and Honcho adapters |
| `@tanstack/ai-mcp` | `ai-mcp` | Connecting to MCP servers, running their tools inside `chat()`, resources, prompts, and the CLI that generates types |
| `@tanstack/ai-sandbox` | `ai-sandbox` | Running harness adapters inside isolated sandboxes with `defineSandbox` / `withSandbox` |
| `@tanstack/ai-code-mode` | `ai-code-mode` | Setting up Code Mode with a sandbox driver and registering server tools |
| `@tanstack/ai-skills` | `ai-skills` | Portable Agent Skills at runtime: the `withSkills` middleware, `load_skill`, the `SkillSource` interface, `inlineSkill` / `skillDirectory` / `staticSkills`, and adding your own tools for skills that carry code |

After you install a package, its skills are at `node_modules/<package>/skills/<skill-name>/SKILL.md`.

Skills route to each other:

- `ai-core` points at the skills of the companion packages.
- `ai-persistence` is an entry point. It routes to its own sub-skills under `skills/ai-persistence/`: `server`, `stores`, and the `build-{drizzle,prisma,cloudflare,custom}-adapter` recipes. This is the same nesting as `ai-core`.

Each skill ships with the code it teaches:

- Locks for many instances are in `@tanstack/ai`, next to `withLocks`. So `ai-core/locks` is in `@tanstack/ai`.
- Browser persistence is in the framework packages. So `ai-core/client-persistence` is in `@tanstack/ai`, not in `@tanstack/ai-persistence`. An app that persists only in the browser never installs the server package.

### The generated mappings

`intent install` adds an `intent-skills` block to your agent config file, or creates the file. It looks like this:

```yaml
<!-- intent-skills:start -->
# Skill mappings: when working in these areas, load the linked skill file into context.
skills:
  - task: "Building chat, tool calling, adapters, or streaming with TanStack AI"
    load: "node_modules/@tanstack/ai/skills/ai-core/SKILL.md"
  - task: "Persisting chat state or building a persistence adapter"
    load: "node_modules/@tanstack/ai-persistence/skills/ai-persistence/SKILL.md"
  - task: "Setting up Code Mode with TanStack AI"
    load: "node_modules/@tanstack/ai-code-mode/skills/ai-code-mode/SKILL.md"
<!-- intent-skills:end -->
```

The agent uses the `task:` descriptions to decide when to load a skill. Make sure that they match the areas you work in. Edit them if they do not.

### Keep skills current

Skills have the same version as the package. When you update `@tanstack/ai`, the `SKILL.md` files under `node_modules` update too. You do not run the CLI again.

Run `npx @tanstack/intent@latest install` again only when:

- You add a new package with skills, for example `@tanstack/ai-code-mode`.
- You want to refresh the task mappings.

### Use skills without the CLI

You can point your agent config file at the skill files yourself. The agent needs at least a pointer to the file:

```markdown
When working on TanStack AI code, read and follow:
node_modules/@tanstack/ai/skills/ai-core/SKILL.md
```

The file paths are stable. The CLI is still the better choice: it finds packages for you and follows the Agent Skills standard.

### Learn more

- [TanStack Intent documentation](https://tanstack.com/intent/latest/docs/overview): the full CLI reference, with `scaffold`, `validate`, and CI setup for library maintainers.
- [Agent Skills registry](https://tanstack.com/intent/registry): other packages that ship skills.
