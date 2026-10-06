---
title: Build a coding agent
id: harness-coding-agent
order: 6
description: "Turn a harness into a coding agent with file tools, permission modes, undo, a todo list, a model picker, project instructions, session titles, a cost count, and /compact."
keywords:
  - tanstack ai
  - harness
  - coding agent
  - permissions
  - workspace tools
  - project instructions
  - undo
---

You want your own coding agent in the terminal. It reads and edits files, and runs commands after you approve them. When a turn goes wrong, you undo it. The first-party plugins in `@tanstack/ai-harness/plugins` and `@tanstack/ai-harness/plugins/coding` give you those parts. You pick the model and the rules.

## 1. Define the agent

```ts group=harness-coding-agent
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineHarness } from '@tanstack/ai-harness'
import {
  compact,
  fileCommands,
  modelPicker,
  permissions,
  projectInstructions,
  title,
  todos,
  usage,
} from '@tanstack/ai-harness/plugins'
import { snapshots, workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { runCli } from '@tanstack/ai-harness-cli'
import { openaiText } from '@tanstack/ai-openai'

const root = process.cwd()
const smart = openaiText('gpt-6.1-sol')
const fast = openaiText('gpt-6-luna')

const coder = defineHarness({
  name: 'acme/coder',
  adapter: smart,
  systemPrompts: ['You are a careful coding agent. Read before you edit.'],
  plugins: () => [
    permissions({ root }),
    workspaceTools({ root }),
    snapshots({ root, dataDir: join(homedir(), '.acme-coder', 'snapshots') }),
    todos(),
    modelPicker({ choices: { smart, fast }, default: 'smart' }),
    fileCommands({ dir: `${root}/.claude/commands` }),
    compact({ adapter: fast }),
    title({ adapter: fast }),
    usage(),
    // Keep this plugin last. See "Project instructions" below.
    projectInstructions({ root }),
  ],
})

process.exitCode = await runCli(coder)
```

Both plugin entries run only in Node. The coding tools use the file system and the shell of the machine.

## 2. Run it

1. Run `npx tsx coder.ts` in your project.
2. Ask for a change. The agent reads files freely, and asks before it writes a file or runs a command.
3. Answer `once` to allow the call, `always` to allow it from now on, or `reject` to refuse it.
4. If you do not like the result, run `/undo`. The files go back to how they were before the turn.

## What each plugin adds

| Plugin | Adds |
|---|---|
| `permissions({ root })` | Asks before risky tool calls. `/mode` switches between `default`, `plan` (read-only), `acceptEdits` (edits run without asking), and `bypass`. See [Ask before risky tool calls](./permissions). |
| `workspaceTools({ root })` | Tools that read, search, and change the files in `root`, run commands, and read web pages. A path outside `root` is refused, or asks first with `outside: 'ask'`. See [Give your agent coding tools](./coding-tools). |
| `snapshots({ root, dataDir })` | `/undo` puts the files back as they were before the last turn, and `/redo` brings them back. It needs `git`. See [Undo a turn](./snapshots). |
| `todos()` | A `todo_write` tool the model uses for multi-step work, and `/todos`. |
| `modelPicker({ choices })` | `/model <name>` switches the model at the next turn. |
| `fileCommands({ dir })` | Each `.md` file becomes a slash command. `$ARGUMENTS` is replaced by what you type after it. |
| `compact({ adapter })` | `/compact` replaces a long conversation with a summary. |
| `title({ adapter })` | Names the session from its first message. |
| `usage()` | `/usage` shows the tokens and the cost of the session, with a line for each model. See [Track usage and cost](./usage). |
| `projectInstructions({ root })` | Adds `AGENTS.md`, `CLAUDE.md`, and facts about the environment to the system prompt. |

To compact on its own before the context limit, see [Compact a harness session](./compaction).

## Project instructions

Your repository has an `AGENTS.md` or a `CLAUDE.md` with its rules. `projectInstructions({ root })` gives them to the model:

- It reads `AGENTS.md` and `CLAUDE.md` in each folder from the repository root (the folder with `.git`) down to `root`. Set other file names with `files`.
- `global` adds files that come first, for example `['~/.config/AGENTS.md']`.
- When `read_file` reads a file in a subfolder, the model also gets the instruction files of the folders on the way, once each.
- An environment block gives the date, the platform, the working folder, and the git repository and branch. `env: false` turns it off.
- When you change an instruction file, the next turn sends the new text as a note.

Put `projectInstructions()` last in the plugin list. Then a changed file goes into the conversation as a [mid-conversation change](../advanced/mid-conversation-changes), and the prompt cache stays. When the prompt of another plugin comes after it, a change builds the system prompt again, and the prompt cache starts again.

## Session titles and cost

`title({ adapter })` and `usage()` write to the session index, one entry per thread:

- `title` names the session from its first message. The turn does not wait for it.
- When `usage` knows the cost of the session, it writes the cost. A cost that the provider reports is used as it is.
- To price the calls of a provider that reports no cost, pass `usage({ model })`. [Track usage and cost](./usage#show-usage-and-price-the-calls) shows how.

A [sidebar of sessions](./sessions) reads the title and the cost from the index. The `usage()` state also has `contextTokens`, the size of the lead model's context at its latest call, for a context meter.

## Add more

- `agents({ adapter })`: named agents with their own prompt, tools, and model. `/agent plan` switches to a read-only agent. See [Switch between agent profiles](./agents).
- `question()`: a `question` tool. The model asks the user to pick an option, and waits for the answer.
- `goal({ judge })`: `/goal <text>` keeps the agent working until a judge model says that the goal is met. See [Work until a goal is met](./goal).
- `mcp({ servers })` from `@tanstack/ai-mcp/harness`: tools from MCP servers. See [Use MCP servers](./mcp).
- `formatter({ root })`: formats each file after a write. See [Format each file after a write](./coding-tools-backends#format-each-file-after-a-write).

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

A trailing `*` matches every tool that starts with the text. The last matching rule wins. [Ask before risky tool calls](./permissions) explains the rules, the modes, and the saved answers.

The workspace tools run on your machine with your permissions. For code that you do not trust, [run the tools in a sandbox](./coding-tools-backends#run-the-tools-in-a-sandbox).

## Hand work to Claude Code or Codex

Your agent can also give tasks to coding agents you already use. [Delegate to coding agents](./coding-agents) shows how.

## What you have now

- A terminal coding agent with file tools, approvals, modes, a todo list, and a model picker.
- `/undo` and `/redo` for the file changes of a turn.
- The rules of your repository in every turn. A change to them keeps the prompt cache.
- A title and a cost for each session.

Next: connect the agent to GitHub and other services with [auth and connectors](./auth).
