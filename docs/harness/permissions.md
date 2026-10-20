---
title: Ask before risky tool calls
id: harness-permissions
order: 9
description: "Make a harness agent ask before it changes a file or runs a command. Pick a mode, write rules for paths and commands, answer the questions, and keep the rules in subagents."
keywords:
  - tanstack ai
  - harness
  - permissions
  - approvals
  - plan mode
  - rules
---

Your agent has tools that change files or run commands. It must not do that without a yes from the user, and some files it must never touch. `permissions()` checks each tool call against rules. Each call runs, waits for the user, or does not run.

## 1. Add the plugin

```ts group=harness-permissions
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { toolDefinition } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'

const root = process.cwd()

const saveNote = toolDefinition({
  name: 'save_note',
  description: 'Write a note file in the project',
  inputSchema: z.object({ path: z.string(), text: z.string() }),
}).server(async ({ path, text }) => {
  await writeFile(resolve(root, path), text)
  return `Saved ${path}.`
})

export const notes = defineHarness({
  name: 'acme/notes',
  adapter: openaiText('gpt-6.1-sol'),
  tools: [saveNote],
  plugins: () => [
    permissions({
      root,
      rules: [{ tool: 'save_note', decision: 'ask', kind: 'edit' }],
    }),
  ],
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(notes, { threadId: 'notes-1' })
```

The rule makes each `save_note` call wait for the user.

## 2. Answer the first approval

The plugin decides each call before it runs. A call that asks opens one approval [wait](./waits), and the turn stops with status `requires_action`. Answer every approval of the turn in one `resolve`:

```ts group=harness-permissions
await session.send('Save a note with the time of the meeting.')

// wait.message is, for example: Allow save_note {"path":"meeting.md","text":"..."}?
const waits = session.snapshot().pendingWaits
await session.resolve({
  inputId: 'approve-1',
  resume: waits.map((wait) => ({
    interruptId: wait.waitId,
    status: 'resolved',
    payload: 'once',
  })),
})
await session.settled({ inputId: 'approve-1' })
```

The answer `once` lets the call run. The agent writes the file and continues. No process waits for the user while the turn is stopped, so the answer can come from any server, also after a restart.

## Pick a mode

The `mode` setting decides how much runs without a question:

| Mode | What happens |
| --- | --- |
| `default` | The rules apply as written. A call that asks waits for the user. |
| `plan` | Read-only. Edits, commands, and calls that ask do not run. The model gets a note to plan and to change no files. |
| `acceptEdits` | Edits run without a question. Commands and formatters still ask. |
| `bypass` | Every call runs, also a call that a rule denies. |

Switch the mode from server code:

```ts group=harness-permissions
await session.setPluginSetting({ key: 'mode', value: 'plan' })
// Or run the command. It returns 'Mode: plan.'
await session.runCommand({ name: 'mode', input: 'plan' })
```

`session.runCommand({ name: 'mode' })` with no input shows the current mode. In `acceptEdits` mode, an edit outside `root` or of a `.env` file still asks.

A mode change applies from the next turn. A turn that runs keeps the mode that it started with, so a switch to `bypass` does not change its later tool calls.

### Keep the mode on the server

A client that can set `mode` can set `bypass`. Then every call runs with no question. So by default, a client cannot change the mode:

- A client `config` input for `mode` gets `{ status: 'rejected', reason: 'not_exposed' }`. The mode stays.
- A client `/mode` command gets the same receipt.
- Server code can still change the mode.

A client can set only the config keys in `expose.config`. It can run only the commands in `expose.commands`. This harness lets a client pick the model, but not the mode:

```ts group=harness-permissions
import { modelPicker } from '@tanstack/ai-harness/plugins'

export const team = defineHarness({
  name: 'acme/team-notes',
  adapter: openaiText('gpt-6.1-sol'),
  tools: [saveNote],
  plugins: () => [
    permissions({ root }),
    modelPicker({
      choices: { sol: openaiText('gpt-6.1-sol'), pro: openaiText('gpt-6.1-sol-pro') },
    }),
  ],
  expose: { config: ['model'], commands: ['model'] },
})
```

Add `mode` to `expose.config` or `expose.commands` only for clients that you trust. Each of these clients can turn the questions off.

## Write rules

Add your own rules with `rules`:

```ts group=harness-permissions
export const strict = permissions({
  root,
  rules: [
    { tool: 'read_file', resource: 'secrets/**', decision: 'deny' },
    { tool: 'edit_file', resource: 'src/**', decision: 'allow' },
    { tool: 'bash', resource: 'pnpm test*', decision: 'allow' },
    { tool: 'deploy_*', decision: 'deny' },
  ],
})
```

A rule has these fields:

- `tool`: a tool name. A `*` at the end matches every tool that starts with that text.
- `decision`: `allow`, `ask`, or `deny`.
- `resource`: optional. A glob on the path or the command that the call touches. Without it, the rule matches every call of the tool. The tool must say what it touches, see [Rules for your own tool](#rules-for-your-own-tool).
- `kind`: optional. `read`, `edit`, or `execute`. The modes read it: `plan` denies `edit` and `execute`, and `acceptEdits` allows `edit`.

The plugin reads the rules in this order, and the last rule that matches a call wins:

1. The rules that other plugins add for their tools.
2. Your `rules`.
3. The saved `always` answers. A saved answer never wins over a `deny`.

Two more rules apply to each tool:

- A tool with no rule runs without a question. To ask for each tool that has no rule, set `default: 'ask'`.
- When the last rule of a tool is a `deny` with no `resource`, the model does not get the tool.

The plugin decides each call in the guard hook, [`onGuardToolCall`](../advanced/middleware#onguardtoolcall). It runs after the input check and after every middleware that changes the arguments. So the rules see the arguments that the tool gets.

### Paths

- Inside `root`, a rule matches the path from `root`, for example `src/app.ts`. Outside `root`, it matches the full path, for example `/etc/hosts`.
- `**` matches any part of a path, so `src/**/a.ts` also matches `src/a.ts`. `*` matches text in one name. `?` matches one character.
- `{a,b}` matches one of the parts, for example `secrets/**/*.{pem,key}`.
- On macOS and Windows, letter case does not count. So a `deny` for `secrets/**` also stops `Secrets/key`.
- A call with more than one path runs only when the rules allow every path.

These paths ask, unless a rule with a `resource` allows them:

- A path outside `root`.
- A `.env` file, for example `.env`, `.env.local`, or `prod.env`.
- A path that the plugin cannot resolve without the file system, for example `C:notes.txt` or `notes.txt:hidden`.

This rule lets the agent read `.env.example` without a question:

```ts group=harness-permissions
export const exampleEnv = permissions({
  root,
  rules: [{ tool: 'read_file', resource: '.env.example', decision: 'allow' }],
})
```

### Commands

- The plugin splits a command at `&&`, `||`, `;`, `|`, and new lines. The rules must allow every part. So when only `ls*` is allowed, `ls && rm -rf build` asks.
- In a command rule, `*` matches any text, also `/`. So `git *` allows `git add src/app.ts`.
- A part with shell syntax that can hide a command never gets an `allow`. This includes `$(`, a backtick, `&`, `<`, `>`, and a heredoc. Such a part asks, or a matching `deny` stops it.

## The rules of the coding tools

`workspaceTools()` from `@tanstack/ai-harness/plugins/coding` adds these rules. [Give your agent coding tools](./coding-tools#permissions-and-approvals) shows what each tool does.

| Tool | Decision | Kind |
| --- | --- | --- |
| `read_file`, `list_files`, `grep` | `allow` | `read` |
| `write_file`, `edit_file`, `patch` | `ask` | `edit` |
| `bash` | `ask` | `execute` |
| `webfetch` | `ask` | none |

- `websearch` has no rule, so it runs.
- The path rules above also apply. For example, `read_file` asks for a `.env` file.
- The coding tools check the real path of a link too, and the stricter decision wins. So a link `notes` to `.env` asks, like `.env`.
- The rules decide a path outside `root` and the real path of a link before the call runs. A coding tool never asks while it runs.
- `grep` skips each file that `read_file` asks about or denies, also after an `always` answer. A note gives the number of skipped files.
- Your `rules` come after these rules, so they win. `{ tool: 'webfetch', decision: 'allow' }` lets `webfetch` run without a question.

### Formatters

A formatter runs code from the project, for example `prettier.config.js` or a package in `node_modules`. The model can edit these files. So the rules decide each run of [`formatter()`](./coding-tools-backends#format-each-file-after-a-write), like `bash`.

It adds one rule: `{ tool: 'formatter:*', decision: 'ask', kind: 'execute' }`. Each run is named `formatter:` and the formatter name, for example `formatter:prettier`.

The rules decide the formatter as a part of the call that writes, before that call runs. The call gets one approval for the write and its formatter. The formatter runs after the write, so no question comes in the middle of a call.

| Mode | What happens |
| --- | --- |
| `default` | The write asks, and the approval also lets the formatter run. |
| `acceptEdits` | A write that a formatter formats asks, because the formatter asks. |
| `bypass` | The write and the formatter run without a question. |
| `plan` | Neither runs. No file changes in this mode. |

- A `reject` stops the call. Nothing is written, and the formatter does not run.
- An `always` answer also saves the formatter for the project, tied to a hash of its config files (`formatter:prettier@<hash>`). The user answers once, until those files change.
- A rule that denies the formatter skips it. The write still runs, and the tool result says that the formatter did not run.
- Without `permissions()`, the formatter runs without a question.

This rule lets prettier run without a question:

```ts group=harness-permissions
export const trustedFormatter = permissions({
  root,
  rules: [{ tool: 'formatter:prettier', decision: 'allow' }],
})
```

## Answer an approval

The plugin decides every call of a model message before any of them runs. Each call that asks opens one approval wait of kind `approval`, and the turn stops. Send the answer as the `payload` of that wait in `session.resolve`. The turn continues when every wait of the turn has an answer.

| Answer | What happens |
| --- | --- |
| `once` or `true` | This call runs. |
| `always` | This call runs, and the plugin saves an `allow` rule for it. |
| `reject` or `false` | The call does not run. The model gets a tool error. |

- Send the answer as a string, `'once'`, as an object, `{ answer: 'once' }`, or as `true` or `false`.
- A reject can carry a `message` for the model: `{ answer: 'reject', message: 'Use pnpm, not npm.' }`. The model gets your message as the tool error.
- Any other answer rejects the call. This includes `'y'` and `'yes'`.
- The `schema` of the wait describes these answers, so a client can show a form for it.

### What `always` saves

- One `allow` rule for each path or command part of the call, for example `{ tool: 'bash', resource: 'pnpm test', decision: 'allow' }`. The rule names that exact text, not a glob.
- One `allow` for the whole tool, when the tool does not say what it touches.
- With a metadata store (`stores.metadata`), the rules belong to `root`. Every session with that `root` uses them, for every user, also after a restart.
- Without a metadata store, the rules stay in memory until the session closes.
- No rule for a part with shell syntax, `*`, or `?`. The next call like it asks again.

### See and forget saved answers

1. Run `session.runCommand({ name: 'permissions' })`. The command lists the saved rules of the project:

```text
Saved rules:
1. bash pnpm test
2. read_file .env
```

2. Run `session.runCommand({ name: 'permissions', input: 'forget 2' })` to delete rule 2. The open session asks again at the next `read_file` call for `.env`.

A client can run the command only when `expose.commands` has `permissions`.

Server code can also read and delete the saved rules without a session. Pass the stores of your host and the same `root` that `permissions()` gets:

```ts group=harness-permissions
import { deleteSavedPermission, listSavedPermissions } from '@tanstack/ai-harness/plugins'

// The persistence that you give to createHarnessHost.
const persistence = memoryPersistence()

const saved = await listSavedPermissions(persistence.stores, root)
const [first] = saved
if (first) await deleteSavedPermission(persistence.stores, root, first)
```

- `deleteSavedPermission` finds the rule by its fields. An unknown rule does nothing.
- New sessions stop using a deleted rule. A session that is open now can keep it until it opens again.
- Without a metadata store, both functions find no rules. The command then lists the answers of the open session.

## Rules in subagents

The same check runs in every agent run of the session:

- Each call in a child run gets the same rules and the same mode. This includes the agents that the model calls, the agents that plugins start, and their children.
- A background agent run that needs an approval stops with status `waiting`. Its approval is in `pendingWaits` of the same session. Answer it with `resolve`, and the run continues. See [When a background agent waits](./subagents#when-a-background-agent-waits).
- An agent that the model calls as a tool inside a turn stops the turn for its approval. The wait has the `agent` that asks. After the `resolve`, that agent goes on. See [When an agent tool waits](./subagents#when-an-agent-tool-waits).
- In `plan` mode, a child cannot change a file. Its call gets the tool error `This tool is not allowed in plan mode.`
- The `permissions` of an [agent profile](./agents) count while that profile is the primary agent, in its turns and in each child run. A child run does not use the rules of its own profile.
- [Coding agents](./coding-agents#plan-mode) such as Claude Code start read-only in `plan` mode.

## Rules for your own tool

A rule with a `resource` can match the calls of your tool only when the tool says what it touches. Add the tool to `PermissionResources`:

```ts
import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { toolDefinition } from '@tanstack/ai'
import { PermissionResources, PermissionRules, definePlugin } from '@tanstack/ai-harness'
import { z } from 'zod'

const root = process.cwd()

const copy = toolDefinition({
  name: 'copy_file',
  description: 'Copy a file in the project',
  inputSchema: z.object({ from: z.string(), to: z.string() }),
}).server(async ({ from, to }) => {
  await copyFile(resolve(root, from), resolve(root, to))
  return `Copied ${from} to ${to}.`
})

/** A string field of the raw input. It throws when the field is missing. */
function field(input: unknown, key: string) {
  const value =
    typeof input === 'object' && input !== null ? Reflect.get(input, key) : undefined
  if (typeof value !== 'string') throw new Error(`No ${key}.`)
  return value
}

export const fileCopy = definePlugin({
  name: 'acme/file-copy',
  setup: () => ({
    tools: [copy],
    contribute: [
      PermissionRules.item({ tool: 'copy_file', decision: 'ask', kind: 'edit' }),
      PermissionResources.item({
        copy_file: { paths: (input) => [field(input, 'from'), field(input, 'to')] },
      }),
    ],
  }),
})
```

Now `{ tool: 'copy_file', resource: 'docs/**', decision: 'allow' }` copies files in `docs` without a question.

- Each function gets the raw input of the model, before the schema check. If it throws, the call does not run, and the model gets `Cannot check the permissions of this call: No from.`
- `paths` are relative to `root`, or absolute. `commands` are command parts, one for each simple command.
- `kind: 'edit'` puts the tool under the modes. `plan` denies it, and `acceptEdits` runs it.
- If a tool does not say what it touches, a rule with a `resource` counts for every call. So a `deny` for one folder denies every call of the tool.

## Ask for a decision from your plugin

Your plugin must know what `permissions()` decides for a tool before the model calls it. Read the answer with `PermissionDecisionCapability`:

```ts
import { PermissionDecisionCapability, definePlugin } from '@tanstack/ai-harness'

export const planTools = definePlugin({
  name: 'acme/plan-tools',
  optionalRequires: [PermissionDecisionCapability],
  setup: (ctx) => ({
    // Give the model only the tools that permissions() allows in plan mode.
    prepareTools: ({ tools }) => {
      const decide = ctx.getOptional(PermissionDecisionCapability)
      if (!decide) return tools
      return tools.filter((tool) => decide(tool.name, 'plan') === 'allow')
    },
  }),
})
```

- The answer is `'allow'`, `'ask'`, or `'deny'`. It uses all rules in their order, your `rules` last, and your `default`.
- Pass what a call touches as a third argument, for example `decide('read_file', 'default', { paths: [file] })`. Then the path rules and `root` apply too.
- Read it when the plugin runs, not in `setup`. Then `permissions()` can come before or after your plugin.
- Saved `always` answers are not part of it. They can only allow, so a check that needs `'allow'` stays strict.
- [Code mode](./code-mode) uses this answer to pick the tools that move into a program. With `default: 'ask'`, a tool with no rule stays a normal tool call.
- `PermissionRules`, `PermissionResources`, `PermissionDecisionCapability`, and `decidePermission` come from `@tanstack/ai-harness`. They load no Node module, so a plugin for an edge runtime can use them. The plugins themselves come from `@tanstack/ai-harness/plugins`, which is Node only.

## Known limits

- `plan` denies only edits, commands, and calls that ask. A tool with no rule, or with an `allow` rule and no `kind`, still runs in `plan` mode. Give each tool that changes something a rule with a `kind`.
- A client that can answer the waits of the thread can answer the approvals, also with `always`. Control who can open a thread.
- `permissions()` does not follow links. Your own tool can check the real path of a link with `PermissionDecisionCapability`.

## What you have now

- An approval before each risky tool call, that any server can answer.
- Modes to plan, to edit fast, or to run everything.
- A mode that a client cannot change, unless you expose it.
- Rules for folders, files, and commands, and saved answers for each project that you can list and forget.
- The same rules in every agent run.

Next: give the agent a planner and a builder with [agent profiles](./agents).
