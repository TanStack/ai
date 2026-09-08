---
name: tanstack-ai
description: >
  Discovery layer for TanStack AI — what it can do and which package provides
  it: chat and streaming, providers and models, framework hooks, tool calling,
  MCP, persistence, memory, code mode, sandboxes and coding-agent harnesses,
  media and voice, devtools. Use when a project is building with TanStack AI,
  asks which package to install, or before writing any TanStack AI code. This
  skill installs the right package and then hands off to that package's own
  SKILL.md, which carries the API details for the installed version.
---

# TanStack AI — capability discovery

This skill is a **map, not a manual**. It tells you which package covers a
need and gets it installed. The API guidance lives inside the packages: every
skill-shipping package carries `skills/<name>/SKILL.md`, versioned with the
code it teaches.

**Never write TanStack AI code from this skill alone.** Resolve to a package
skill or to the docs first — improvised code drifts into other SDKs' APIs
(`streamText`, `createOpenAI`, `onFinish`), none of which exist here.

## Procedure

### 1. Read the project

```bash
ls node_modules/@tanstack 2>/dev/null
```

That is what the app actually has. Also check `package.json` dependencies for
the intended stack, and the lockfile (`pnpm-lock.yaml`, `package-lock.json`,
`yarn.lock`, `bun.lock`) for which package manager to use below.

### 2. Route the need to a package

| The user wants to... | Install |
| --- | --- |
| Stream a chat, call tools, agent loops, structured outputs, middleware | `@tanstack/ai` |
| Talk to a specific model provider | the matching adapter — `@tanstack/ai-openai`, `-anthropic`, `-gemini`, `-grok`, `-groq`, `-mistral`, `-cohere`, `-ollama`, `-bedrock`, `-vertex`, `-openrouter`, `-vercel-gateway`, `-llmgateway`, `-lovable`, `-byteplus`, `-cloudflare`, `-fal`, `-elevenlabs`, `-perplexity`, `-reactor` |
| Chat UI / hooks in a framework | `@tanstack/ai-react`, `-vue`, `-solid`, `-svelte`, `-preact`, `-angular`, `-octane`, `-remix`; vanilla JS uses `@tanstack/ai-client` |
| Keep chat state on the server, resume runs, approvals | `@tanstack/ai-persistence` |
| Survive a dropped connection mid-stream | `@tanstack/ai-durable-stream` |
| Long-term memory across conversations | `@tanstack/ai-memory` |
| Use tools from MCP servers | `@tanstack/ai-mcp` |
| Let the model orchestrate tools by writing TypeScript | `@tanstack/ai-code-mode` plus an `@tanstack/ai-isolate-*` driver |
| Run a coding agent (Claude Code, Codex, OpenCode, Grok Build) as a backend | the harness adapter plus `@tanstack/ai-sandbox` and an `@tanstack/ai-sandbox-*` provider |
| Load SKILL.md files at runtime, inside the app's own agent | `@tanstack/ai-skills` |
| Keep a long conversation inside the context window | `@tanstack/ai-compaction` |
| Inspect messages, tool calls, and streams while developing | `@tanstack/ai-devtools-core` plus the framework devtools package |

Images, video, speech, and transcription are part of `@tanstack/ai` itself —
they need a provider adapter that supports the modality, not a separate
package.

For anything not listed, read [`packages.md`](./packages.md) — the full
generated catalog of every published package and the skills it ships.

### 3. Install what is missing

Use the project's package manager. Do not add a package the task does not
need, and do not pin a version — skills travel with the package, so the
current release carries the current guidance.

```bash
pnpm add @tanstack/ai @tanstack/ai-openai   # npm install / yarn add / bun add
```

### 4. Hand off to the package's own skill

```bash
cat node_modules/@tanstack/ai/skills/ai-core/SKILL.md
```

Read it and follow it. Entry skills route to sub-skills (for example
`ai-core/tool-calling`, `ai-persistence/build-drizzle-adapter`) — follow those
links rather than answering from this map.

If the package ships no skills, use https://tanstack.com/ai/latest/docs, the
package README, and its type declarations.

If a package is installed but its skill lacks the surface being asked about,
say so and name the installed version (`node -p "require('@tanstack/ai-persistence/package.json').version"`)
before suggesting an upgrade. The installed skill is the source of truth for
the installed version; anything newer belongs to a version the app does not
have yet.

## Wiring skills into the project permanently

A plugin install is per user. To give the skills to everyone on the repo, and
to agents with no plugin marketplace, write them into the project:

```bash
npx skills add TanStack/ai                  # copies these skills into the repo
npx @tanstack/intent@latest install         # maps tasks to the installed packages' skills
```

`intent install` writes task mappings into `AGENTS.md`, `CLAUDE.md`, and
`.cursorrules` that point at `node_modules/**/SKILL.md`. It packages skills. It
is not a prerequisite here: those files are readable without it.

## Not covered here

Runtime snippet libraries (`@tanstack/ai-code-mode-snippets`) and portable
runtime skills (`@tanstack/ai-skills`) are app features, not coding-agent
guidance. They are in the catalog; their own skills explain them.
