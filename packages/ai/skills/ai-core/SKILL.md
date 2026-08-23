---
name: ai-core
description: >
  Entry point for TanStack AI skills. Routes to chat-experience, tool-calling,
  media-generation, structured-outputs, adapter-configuration, ag-ui-protocol,
  middleware, locks, custom-backend-integration, and debug-logging, plus the skills
  shipped by companion packages (@tanstack/ai-persistence, @tanstack/ai-code-mode).
  Use chat() not streamText(), openaiText() not createOpenAI(),
  toServerSentEventsResponse() not manual SSE, middleware hooks not onEnd callbacks.
type: core
library: tanstack-ai
library_version: '0.42.0'
---

# TanStack AI — Core Concepts

TanStack AI is a type-safe, provider-agnostic AI SDK. Server-side functions
live in `@tanstack/ai` and provider adapter packages. Client-side hooks live
in framework packages (`@tanstack/ai-react`, `@tanstack/ai-solid`, etc.).
Always import from the framework package on the client — never from
`@tanstack/ai-client` directly (unless vanilla JS).

## Sub-Skills

| Need to...                                        | Read                                          |
| ------------------------------------------------- | --------------------------------------------- |
| Build a chat UI with streaming                    | ai-core/chat-experience/SKILL.md              |
| Survive a browser reload (no extra package)       | ai-core/client-persistence/SKILL.md           |
| Add tool calling (server, client, or both)        | ai-core/tool-calling/SKILL.md                 |
| Generate images, video, speech, or transcriptions | ai-core/media-generation/SKILL.md             |
| Get typed JSON responses from the LLM             | ai-core/structured-outputs/SKILL.md           |
| Choose and configure a provider adapter           | ai-core/adapter-configuration/SKILL.md        |
| Implement AG-UI streaming protocol server-side    | ai-core/ag-ui-protocol/SKILL.md               |
| Add analytics, logging, or lifecycle hooks        | ai-core/middleware/SKILL.md                   |
| Coordinate multi-instance work with locks         | ai-core/locks/SKILL.md                        |
| Connect to a non-TanStack-AI backend              | ai-core/custom-backend-integration/SKILL.md   |
| Turn on/off debug logging, pipe into pino/winston | ai-core/debug-logging/SKILL.md                |
| Persist chats server-side (history, runs)         | See `@tanstack/ai-persistence` package skills |
| Set up Code Mode (LLM code execution)             | See `@tanstack/ai-code-mode` package skills   |
| Give the model a catalog of SKILL.md skills       | See `@tanstack/ai-skills` package skills       |

## Companion packages

Some capabilities live in their own package and ship their own skills. Install
the package, then read its skills — do not guess the API from this file.

### `@tanstack/ai-persistence` — durable chat state

Makes a conversation survive a reload, a server restart, a second device, or a
paused tool approval. It ships the **store contracts** (`MessageStore`,
`RunStore`, `InterruptStore`, `MetadataStore`), the `withPersistence` /
`withGenerationPersistence` middleware, `reconstructChat` for server-side
hydrate, an in-memory reference backend, and a conformance testkit. Multi-instance
locks are **not** in this package — `LockStore` / `withLocks` ship in
`@tanstack/ai/locks`; see ai-core/locks. The `runs` store contract is typed
against run lifecycle types (`RunStatus`, `RunRecord`, `RunStore`,
`defineRunStore`, `InMemoryRunStore`), which ship in `@tanstack/ai` itself;
see ai-core/middleware.

It does **not** ship a backend for your database — you implement the stores
against Postgres, SQLite, D1, Mongo, or whatever you run, and the package's
skills walk you through it (including Drizzle, Prisma, and Cloudflare recipes).

```bash
pnpm add @tanstack/ai-persistence
npx @tanstack/intent@latest install
```

The skills ship **inside** the package, so they only exist on disk once it is
installed — the second command re-scans `node_modules` and wires them into the
agent config. Until then the paths below resolve to nothing.

Entry point: `node_modules/@tanstack/ai-persistence/skills/ai-persistence/SKILL.md`

| Need to...                                      | Read                                    |
| ----------------------------------------------- | --------------------------------------- |
| Wire server-side chat history, runs, interrupts | ai-persistence/server/SKILL.md          |
| Implement the store interfaces for your DB      | ai-persistence/stores/SKILL.md          |
| Write the adapter for the DB your app runs      | ai-persistence/build-*-adapter/SKILL.md |

Browser-side persistence is **not** in this package — it ships with the
framework packages, so read **ai-core/client-persistence** instead.

### `@tanstack/ai-code-mode` — LLM code execution

See the `ai-code-mode` skill in that package.

### `@tanstack/ai-skills` — portable Agent Skills at runtime

Gives the model a library of `SKILL.md` skills it can load on demand, on any
provider, via the `withSkills` middleware and a `load_skill` tool. Skills come
from `inlineSkill`, `skillDirectory`, or a build-time bundle. This is the
runtime feature for the model **inside your app**, not the coding-assistant
skills this file is part of, and not the hosted `codeExecutionTool` /
`shellTool` skills (those run in a provider sandbox).

```bash
pnpm add @tanstack/ai-skills
npx @tanstack/intent@latest install
```

Entry point: `node_modules/@tanstack/ai-skills/skills/ai-skills/SKILL.md`

## Quick Decision Tree

- Setting up a chatbot? → ai-core/chat-experience
- Adding function calling? → ai-core/tool-calling
- Generating media (images, audio, video)? → ai-core/media-generation
- Need structured JSON output? → ai-core/structured-outputs
- Choosing/configuring a provider? → ai-core/adapter-configuration
- Building a server-only AG-UI backend? → ai-core/ag-ui-protocol
- Adding analytics or post-stream events? → ai-core/middleware
- Surviving reloads / multi-device / durable approvals? → `@tanstack/ai-persistence` skills
- Connecting to a custom backend? → ai-core/custom-backend-integration
- Turning on debug logging to trace chunks/tools/middleware? → ai-core/debug-logging
- Debugging mistakes? → Check Common Mistakes in the relevant sub-skill

## Critical Rules

1. **This is NOT the Vercel AI SDK.** Use `chat()` not `streamText()`. Use `openaiText()` not `createOpenAI()`. Import from `@tanstack/ai`, not `ai`.
2. **Import from framework package on client.** Use `@tanstack/ai-react` (or solid/vue/svelte/preact), not `@tanstack/ai-client`.
3. **Use `toServerSentEventsResponse()`** to convert streams to HTTP responses. Never implement SSE manually.
4. **Use middleware for lifecycle events.** No `onEnd`/`onFinish` callbacks on `chat()` — use `middleware: [{ onFinish: ... }]`.
5. **Ask the user which adapter and model** they want. Suggest the latest model. Also ask if they want Code Mode.
6. **Tools must be passed to both server and client.** Server gets the tool in `chat({ tools })`; the client passes the `.client()` implementation through the `clientTools()` helper into the **`tools`** option — `useChat({ tools: clientTools(myTool.client(...)) })`. There is no `clientTools` option. See ai-core/tool-calling.

## Version

Targets TanStack AI v0.42.0.
