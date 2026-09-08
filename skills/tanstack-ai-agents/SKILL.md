---
name: tanstack-ai-agents
description: >
  Give a TanStack AI app agent capabilities: tool calling, MCP servers, Code
  Mode TypeScript execution, isolated sandboxes, coding-agent harnesses (Claude
  Code, Codex, OpenCode, Grok Build), long-term memory, and runtime SKILL.md
  loading. Use when someone asks how the model runs tools, wants an agent loop,
  connects an MCP server, executes model-written code safely, runs a coding
  agent as a chat backend, or remembers facts across conversations. Triggers on
  "tool calling", "MCP", "code mode", "sandbox", "isolate", "agent loop",
  "Claude Code adapter", "memory", "load_skill".
---

# TanStack AI agent capabilities

Tools are the base. Everything else here layers on top of `chat()`.

## Tools first: no package needed

Isomorphic tools ship in `@tanstack/ai`. Define once with `toolDefinition()`,
then attach a `.server()` or `.client()` implementation. Read the tool-calling
sub-skill before writing one:

```bash
cat node_modules/@tanstack/ai/skills/ai-core/tool-calling/SKILL.md
```

## 1. Route to the capability

| The task | Package | Skill it ships |
| --- | --- | --- |
| Use tools exposed by an MCP server | `@tanstack/ai-mcp` | `ai-mcp` |
| Let the model orchestrate tools by writing TypeScript | `@tanstack/ai-code-mode` plus an isolate driver | `ai-code-mode` |
| Run a harness adapter inside an isolated sandbox | `@tanstack/ai-sandbox` plus a provider | `ai-sandbox` |
| Remember facts across conversations | `@tanstack/ai-memory` | `tanstack-ai-memory` |
| Load SKILL.md files at runtime, inside the app's agent | `@tanstack/ai-skills` | `ai-skills` |

[`packages.md`](./packages.md) lists every package in this group, including the
drivers and providers below.

## 2. Code Mode needs a driver

`@tanstack/ai-code-mode` executes the model's TypeScript, and an
`@tanstack/ai-isolate-*` package decides where. Pick by runtime: QuickJS WASM
runs anywhere, `-node` uses isolated-vm, `-cloudflare` runs at the edge,
`-daytona` runs remotely, `-quickjs-bun` is native on Bun.

## 3. Harness adapters need a sandbox

`@tanstack/ai-claude-code`, `-codex`, `-opencode`, and `-grok-build` run a
coding agent as a chat backend, with local tool execution. Give them a sandbox
unless the agent is meant to touch the host: `@tanstack/ai-sandbox` plus a
provider such as `-cloudflare`, `-daytona`, `-docker`, `-vercel`, `-sprites`,
`-blaxel`, `-upstash-box`, or `-local-process`.

`@tanstack/ai-acp` carries the Agent Client Protocol transport those adapters
share. Install it directly only when writing an ACP integration.

## 4. Then read the package skill

Every package in the table ships a skill. Read it before writing code:

```bash
cat node_modules/@tanstack/ai-code-mode/skills/ai-code-mode/SKILL.md
```

## Two things named "skills"

`@tanstack/ai-skills` loads SKILL.md files for the model **inside the app** at
runtime. That is a different feature from the skills that teach a coding agent,
which is what you are reading now.
