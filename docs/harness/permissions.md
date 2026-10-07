---
title: Ask before risky tool calls
id: harness-permissions
order: 7
description: "Make a harness agent ask before it changes a file or runs a command. Pick a mode, write rules for paths and commands, answer the questions from a client, and keep the rules in subagents."
keywords:
  - tanstack ai
  - harness
  - permissions
  - approvals
  - plan mode
  - rules
---

Your agent can change files and run commands. It must not do that without a yes from the user, and some files it must never touch. `permissions()` checks each tool call against rules. Each call runs, waits for the user, or does not run.

## 1. Add the plugin

```ts group=harness-permissions
import { defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { runCli } from '@tanstack/ai-harness-cli'
import { openaiText } from '@tanstack/ai-openai'

const root = process.cwd()

const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [permissions({ root }), workspaceTools({ root })],
})

process.exitCode = await runCli(coder)
```

Give `permissions()` and `workspaceTools()` the same `root`. The rules match paths from there.

## 2. Answer the first question

1. Run `npx tsx coder.ts` in your project.
2. Ask: `add a test for the date parser`.
3. Wait for the question. The agent reads files without a question, but it asks before it writes a file:

```text
? Allow write_file {"path":"src/date.test.ts","content":"..."}? Answer once, always, or reject.
```

4. Type `once`.

The agent writes the file and continues.

## Pick a mode

The `mode` setting decides how much runs without a question:

| Mode | What happens |
| --- | --- |
| `default` | The rules apply as written. A call that asks waits for the user. |
| `plan` | Read-only. Edits, commands, and calls that ask do not run. The model gets a note to plan and to change no files. |
| `acceptEdits` | Edits run without a question. Commands still ask. |
| `bypass` | Every call runs, also a call that a rule denies. |

Switch the mode in one of these places:

- The CLI: type `/mode plan`. `/mode` alone shows the current mode.
- Server code: call `session.setConfig('mode', 'plan')`.
- A client: only when the harness exposes `mode`. See [Keep the mode on the server](#keep-the-mode-on-the-server).

In `acceptEdits` mode, an edit outside `root` or of a `.env` file still asks.

### Keep the mode on the server

A client that can set `mode` can set `bypass`. Then every call runs with no question. So by default, a client cannot change the mode:

- `client.setConfig('mode', 'bypass')` gets `{ status: 'rejected', reason: 'not_exposed' }`. The mode stays.
- The `/mode` command from a client gets the same receipt.
- The CLI and server code can still change the mode.

A client can set only the config keys in `expose.config`. It can run only the commands in `expose.commands`. This harness lets a client pick the model, but not the mode:

```ts group=harness-permissions
import { modelPicker } from '@tanstack/ai-harness/plugins'

export const team = defineHarness({
  name: 'acme/team-coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    permissions({ root }),
    workspaceTools({ root }),
    modelPicker({
      choices: { sol: openaiText('gpt-6.1-sol'), pro: openaiText('gpt-6.1-sol-pro') },
    }),
  ],
  expose: { config: ['model'], commands: ['model'] },
})
```

Add `mode` to `expose.config` or `expose.commands` only for clients that you trust. Each of these clients can turn the questions off. [Choose what clients can change](./connect#choose-what-clients-can-change) lists every `expose` field.

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
- `resource`: optional. A glob on the path or the command that the call touches. Without it, the rule matches every call of the tool.
- `kind`: optional. `read`, `edit`, or `execute`. The modes read it: `plan` denies `edit` and `execute`, and `acceptEdits` allows `edit`.

The plugin reads the rules in this order, and the last rule that matches a call wins:

1. The rules of the tool plugins, for example the coding tools.
2. Your `rules`.
3. The saved `always` answers. A saved answer never wins over a `deny`.

Two more rules apply to each tool:

- A tool with no rule runs without a question. To ask for each tool that has no rule, set `default: 'ask'`.
- When the last rule of a tool is a `deny` with no `resource`, the model does not get the tool.

### Paths

- Inside `root`, a rule matches the path from `root`, for example `src/app.ts`. Outside `root`, it matches the full path, for example `/etc/hosts`.
- `**` matches any part of a path. `*` matches text in one name. `?` matches one character.
- On macOS and Windows, letter case does not count. So a `deny` for `secrets/**` also stops `Secrets/key`.
- A call with more than one path, for example a `patch`, runs only when the rules allow every path.

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

- `bash` splits a command at `&&`, `||`, `;`, `|`, and new lines. The rules must allow every part. So when only `ls*` is allowed, `ls && rm -rf build` asks.
- In a command rule, `*` matches any text, also `/`. So `git *` allows `git add src/app.ts`.
- A part with shell syntax that can hide a command never gets an `allow`. This includes `$(`, a backtick, `&`, `<`, `>`, and a heredoc. Such a part asks, or a matching `deny` stops it.

## The built-in rules

`workspaceTools()` adds these rules. [Give your agent coding tools](./coding-tools#permissions-and-approvals) shows what each tool does.

| Tool | Decision | Kind |
| --- | --- | --- |
| `read_file`, `list_files`, `grep` | `allow` | `read` |
| `write_file`, `edit_file`, `patch` | `ask` | `edit` |
| `bash` | `ask` | `execute` |
| `webfetch` | `ask` | none |

- `websearch` has no rule, so it runs.
- The path rules above also apply. For example, `read_file` asks for a `.env` file.
- The coding tools check the real path of a link too, and the stricter decision wins. So a link `notes` to `.env` asks, like `.env`.
- `grep` skips each file that `read_file` asks about or denies, also after an `always` answer. A note gives the number of skipped files.
- Your `rules` come after these rules, so they win. `{ tool: 'webfetch', decision: 'allow' }` lets `webfetch` run without a question.

## Answer a question

A call that asks waits for one of three answers:

| Answer | What happens |
| --- | --- |
| `once` | This call runs. |
| `always` | This call runs, and the plugin saves an `allow` rule for it. |
| `reject` | The call does not run. The model gets a tool error. |

- Send the answer as a string, `'once'`, or as an object, `{ answer: 'once' }`.
- A reject can carry a `message` for the model: `{ answer: 'reject', message: 'Use pnpm, not npm.' }`. The model gets your message as the tool error.
- Any other answer rejects the call. This includes `y` and `yes`.

### In a web app

Show the question with three buttons. `question.answer()` sends the choice:

```ts group=harness-permissions-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import { createSessionView } from '@tanstack/ai-harness/view'

const view = createSessionView(
  createHarnessClient({ url: '/api/harness', threadId: 'fix-login' }),
)

view.on('question', (question) => {
  const card = document.createElement('div')
  const note = document.createElement('input')
  note.setAttribute('aria-label', 'Note for the model, sent with reject')
  card.append(question.message, note)
  for (const answer of ['once', 'always', 'reject']) {
    const button = document.createElement('button')
    button.textContent = answer
    button.onclick = () => {
      card.remove()
      void question.answer({ answer, message: note.value })
    }
    card.append(button)
  }
  document.body.append(card)
})
```

This card fits the permission question. A question from another plugin has its own `schema`.

### In other places

- The CLI: type `once`, `always`, or `reject`. To add a note, type JSON: `{"answer":"reject","message":"Use pnpm."}`.
- A client without a view: call `client.answer(questionId, value)`. Over HTTP, send `POST control` with `{ threadId, input: { op: 'answer', questionId, value } }`.
- Server code: call `session.answer(questionId, value)`. `session.snapshot().pendingQuestions` lists the open questions.
- The [dashboard](./dashboard) shows each question in the browser.

### What `always` saves

- One `allow` rule for each path or command part of the call, for example `{ tool: 'bash', resource: 'pnpm test', decision: 'allow' }`. The rule names that exact text, not a glob.
- One `allow` for the whole tool, when the tool does not say what it touches.
- With a metadata store (`stores.metadata`), the rules belong to `root`. Every session with that `root` uses them, for every user, also after a restart.
- Without a metadata store, the rules stay in memory until the session closes.
- No rule for a part with shell syntax, `*`, or `?`. The next call like it asks again.

### See and forget saved answers

1. Type `/permissions`. The command lists the saved rules of the project:

```text
Saved rules:
1. bash pnpm test
2. read_file .env
```

2. Type `/permissions forget 2` to delete rule 2. The open session asks again at the next `read_file` call for `.env`.

A client can run the command only when `expose.commands` has `permissions`.

Server code can read and delete the saved rules too. Pass the stores of your host and the same `root` that `permissions()` gets:

```ts group=harness-permissions
import { memoryPersistence } from '@tanstack/ai-persistence'
import { deleteSavedPermission, listSavedPermissions } from '@tanstack/ai-harness/plugins'

// The persistence that you give to createHarnessHost.
const persistence = memoryPersistence()

const saved = await listSavedPermissions(persistence.stores, root)
const [first] = saved
if (first) await deleteSavedPermission(persistence.stores, root, first)
```

- `deleteSavedPermission` finds the rule by its fields. An unknown rule does nothing.
- New sessions stop using a deleted rule. A session that is open now can keep it until it opens again.
- Without a metadata store, both functions find no rules. `/permissions` then lists the answers of the open session.

## Rules in subagents

The same check runs in every agent run of the session:

- Each call in a child run gets the same rules and the same mode. This includes the agents that the model calls, the agents that plugins start, and their children.
- A question from a child waits in the same session. Answer it the same way.
- In `plan` mode, a child cannot change a file. Its call gets the tool error `This tool is not allowed in plan mode.`
- The `permissions` of an [agent profile](./agents) count only while that profile is the primary agent. They do not apply when the profile runs as a subagent.
- [Coding agents](./coding-agents#plan-mode) such as Claude Code start read-only in `plan` mode.

## Rules for your own tool

Your plugin adds a tool that touches files. A rule with a `resource` can match its calls only when the tool says what it touches. Add the tool to `PermissionResources`:

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
- [Code mode](./code-mode) keeps a tool with resources as a normal tool call, so the plugin still checks each call.

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
- [Code mode](./code-mode) uses this answer. With `default: 'ask'`, a tool with no rule stays a normal tool call.

## Known limits

- A rule that allows a tool with no `kind` also lets it run in `plan` mode. For example, an `allow` for `webfetch` lets it fetch pages in `plan` mode. `plan` denies only edits, commands, and calls that ask.
- `serveAcp` does not show harness questions. An editor that uses [ACP](./connect#use-it-from-an-editor-acp) shows tool approvals only, so a call that asks waits.
- A client that can send inputs to the thread can answer the questions, also with `always`. Control who opens a thread with `canAccess`. See [Connect clients](./connect).
- `permissions()` does not follow links. The coding tools check the real path of a link, and your own tool can do it with `PermissionDecisionCapability`.

## What you have now

- A question before each edit, command, and web fetch.
- Modes to plan, to edit fast, or to run everything.
- A mode that a client cannot change, unless you expose it.
- Rules for folders, files, and commands, and saved answers for each project that you can list and forget.
- The same rules in every agent run.

Next: give the agent a planner and a builder with [agent profiles](./agents).
