---
title: Delegate to coding agents
id: harness-coding-agents
order: 11
description: "Let a harness hand coding work to Claude Code, Codex, Grok Build, or any ACP agent. Each one works in a sandbox and keeps its own session."
keywords:
  - tanstack ai
  - harness
  - claude code
  - codex
  - grok build
  - sandbox
  - subagents
---

Your lead agent plans the work, but you want Claude Code or Codex to do the edits, because they are good at code and you already use them. `codingAgents` gives the lead model one tool per coding agent. Each agent works in a sandbox, keeps its own session between calls, and its tool calls show up in your UI.

## 1. Add the plugin

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-harness @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code @tanstack/ai-codex
vue: @tanstack/ai-harness @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code @tanstack/ai-codex
solid: @tanstack/ai-harness @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code @tanstack/ai-codex
svelte: @tanstack/ai-harness @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code @tanstack/ai-codex
preact: @tanstack/ai-harness @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code @tanstack/ai-codex
angular: @tanstack/ai-harness @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code @tanstack/ai-codex
octane: @tanstack/ai-harness @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code @tanstack/ai-codex
vanilla: @tanstack/ai-harness @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code @tanstack/ai-codex

<!-- ::end:tabs -->

```ts group=harness-coding-agents
import { defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codexText } from '@tanstack/ai-codex'
import { openaiText } from '@tanstack/ai-openai'
import { defineSandbox, defineWorkspace, localSource } from '@tanstack/ai-sandbox'
import { codingAgents } from '@tanstack/ai-sandbox/harness'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const repo = '/path/to/your/repo'

export const lead = defineHarness({
  name: 'acme/lead',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    permissions(),
    codingAgents({
      sandbox: defineSandbox({
        id: 'repo',
        provider: localProcessSandbox({ dir: repo }),
        workspace: defineWorkspace({ source: localSource(repo) }),
      }),
      agents: {
        claude_code: {
          adapter: claudeCodeText('claude-opus-4-8', { permissionMode: 'acceptEdits' }),
          description: 'Larger changes, refactors, and reviews',
        },
        codex: {
          adapter: codexText('gpt-5.3-codex', { sandboxMode: 'workspace-write' }),
          description: 'Quick fixes and tests',
        },
      },
    }),
  ],
})
```

The lead model now has a `claude_code` tool and a `codex` tool. Each tool takes one `task`: the whole job, in words. The agent sees only that text and the files in its sandbox.

## 2. Ask for work

1. Start the harness, for example with the CLI.
2. Ask the lead: `have claude_code add a test for the date parser, then have codex fix what fails`.
3. Watch the child work. The CLI shows each agent's tool calls, then one line with the start of its answer:

```text
[agent claude_code started]
[claude_code: tool Write]
[agent claude_code finished: Added parse-date.test.ts with three cases.]
```

The dashboard shows the same work in a block under the lead's message. An ACP editor shows the child's tool calls next to the lead's own.

## Sessions

Each agent keeps its own session per harness thread. The next task for `claude_code` resumes the same Claude Code session, so it still knows the files it read. The session ids live in the plugin state, so they also survive a restart of the host.

To start over, run `/fresh claude_code`, or `/fresh` for every agent.

## Workspaces

`workspace` chooses where the agents work:

| Value | Where each agent works | At the same time |
| --- | --- | --- |
| `'shared'` (default) | One sandbox per harness thread | One agent at a time |
| `'per-agent'` | A sandbox per agent | Yes |

Use `'shared'` when the agents build on each other's changes. Use `'per-agent'` when they work on separate copies and you merge the results.

## Plan mode

When the `permissions()` plugin is in [`plan` mode](./permissions#pick-a-mode), the agents start read-only:

- Claude Code gets `permissionMode: 'plan'`.
- Codex gets `sandboxMode: 'read-only'`.
- Any other agent gets its `planModelOptions`, for example `{ permissionMode: 'default' }` for an ACP agent that asks before each edit.

## Other agents and sandboxes

- `adapter` takes any coding-agent adapter: `grokBuildText` from `@tanstack/ai-grok-build`, or `acpCompatibleText` from `@tanstack/ai-acp` for any ACP agent.
- `sandbox` takes any sandbox provider. [Sandbox providers](../sandbox/providers) lists them.
- `modelOptions` on an agent is added to every call, for example a fixed `permissionMode`.

## What you have now

- A lead model that hands tasks to Claude Code and Codex.
- One sandbox per thread, and one saved session per agent.
- Child tool calls in the CLI, the dashboard, and ACP editors.
