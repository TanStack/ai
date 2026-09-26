---
title: Build a coding agent
id: harness-coding-agent
order: 6
description: "Turn a harness into a coding agent with file tools, permission modes, a todo list, a model picker, project instructions, and /compact."
keywords:
  - tanstack ai
  - harness
  - coding agent
  - permissions
  - workspace tools
---

You want your own coding agent in the terminal: it reads and edits files, runs commands after you approve them, and keeps a todo list. The first-party plugins in `@tanstack/ai-harness/plugins` give you those parts. You pick the model and the rules.

## 1. Define the agent

```ts group=harness-coding-agent
import { defineHarness } from '@tanstack/ai-harness'
import {
  compact,
  fileCommands,
  modelPicker,
  permissions,
  projectInstructions,
  todos,
  usage,
  workspaceTools,
} from '@tanstack/ai-harness/plugins'
import { runCli } from '@tanstack/ai-harness-cli'
import { openaiText } from '@tanstack/ai-openai'

const root = process.cwd()
const smart = openaiText('gpt-5.6')
const fast = openaiText('gpt-5.6-luna')

const coder = defineHarness({
  name: 'acme/coder',
  adapter: smart,
  systemPrompts: ['You are a careful coding agent. Read before you edit.'],
  plugins: () => [
    permissions(),
    workspaceTools({ root }),
    todos(),
    modelPicker({ choices: { smart, fast }, default: 'smart' }),
    projectInstructions({ root }),
    fileCommands({ dir: `${root}/.claude/commands` }),
    compact({ adapter: fast }),
    usage(),
  ],
})

process.exitCode = await runCli(coder)
```

## 2. Run it

Run the file with `npx tsx coder.ts`. Ask for a change. The agent reads files freely and asks before it writes a file or runs a command. Type `y` to allow a call or `n` to refuse it.

## What each plugin adds

| Plugin | Adds |
|---|---|
| `permissions()` | Asks before risky tool calls. `/mode` switches between `default`, `plan` (read-only), `acceptEdits` (edits run without asking), and `bypass`. |
| `workspaceTools({ root })` | `read_file`, `write_file`, `edit_file`, `list_files`, `grep`, and `bash`, confined to `root`. |
| `todos()` | A `todo_write` tool the model uses for multi-step work, and `/todos`. |
| `modelPicker({ choices })` | `/model <name>` switches the model at the next turn. |
| `projectInstructions({ root })` | Adds `AGENTS.md` and `CLAUDE.md` to the system prompt. |
| `fileCommands({ dir })` | Each `.md` file becomes a slash command. `$ARGUMENTS` is replaced by what you type after it. |
| `compact({ adapter })` | `/compact` replaces a long conversation with a summary. |
| `usage()` | `/usage` shows the tokens of the session. |

## Add your own rules

Tool plugins add permission rules to the `PermissionRules` extension point. Add your own for any tool:

```ts group=harness-coding-agent
import { PermissionRules } from '@tanstack/ai-harness/plugins'
import { definePlugin } from '@tanstack/ai-harness'

export const noDeploys = definePlugin({
  name: 'acme/no-deploys',
  setup: () => ({
    contribute: [PermissionRules.item({ tool: 'deploy_*', decision: 'deny' })],
  }),
})
```

A trailing `*` matches every tool that starts with the text. The last matching rule wins.

The workspace tools run on your machine with your permissions. Run code you do not trust in a sandbox.

## What you have now

- A terminal coding agent with file tools, approvals, modes, a todo list, and a model picker.

Next: connect the agent to GitHub and other services with [auth and connectors](./auth).
