---
title: Code mode in a harness
id: harness-code-mode
order: 13
description: "Let the harness model write one TypeScript program that calls many tools, also the coding tools under their permission rules, and run it in an isolate. Any TanStack AI isolate driver plugs in."
keywords:
  - tanstack ai
  - harness
  - code mode
  - isolate
  - quickjs
  - permissions
---

Your agent has many read-only tools, and it calls them one at a time. Each call is a model round trip, and every tool schema goes into every request. With code mode, the model writes one TypeScript program that calls the tools it needs, and the program runs in an isolate. The read-only tools leave the tool list and become functions in that program. The [coding tools](#run-the-coding-tools-in-a-program) can move too, and each of their calls keeps its permission rules.

## 1. Add the plugin

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-code-mode @tanstack/ai-isolate-quickjs
vue: @tanstack/ai-code-mode @tanstack/ai-isolate-quickjs
solid: @tanstack/ai-code-mode @tanstack/ai-isolate-quickjs
svelte: @tanstack/ai-code-mode @tanstack/ai-isolate-quickjs
preact: @tanstack/ai-code-mode @tanstack/ai-isolate-quickjs
angular: @tanstack/ai-code-mode @tanstack/ai-isolate-quickjs
octane: @tanstack/ai-code-mode @tanstack/ai-isolate-quickjs
vanilla: @tanstack/ai-code-mode @tanstack/ai-isolate-quickjs

<!-- ::end:tabs -->

```ts group=harness-code-mode
import { toolDefinition } from '@tanstack/ai'
import { codeMode } from '@tanstack/ai-code-mode/harness'
import { defineHarness } from '@tanstack/ai-harness'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const issues = [{ id: 'ENG-1', title: 'Fix login', state: 'open' }]

const listIssues = toolDefinition({
  name: 'list_issues',
  description: 'List the issues of the team',
  inputSchema: z.object({ state: z.enum(['open', 'closed']) }),
}).server(async ({ state }) => issues.filter((issue) => issue.state === state))

const getIssue = toolDefinition({
  name: 'get_issue',
  description: 'Get one issue by id',
  inputSchema: z.object({ id: z.string() }),
}).server(async ({ id }) => issues.find((issue) => issue.id === id) ?? null)

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  tools: [listIssues, getIssue],
  plugins: () => [codeMode({ driver: createQuickJSIsolateDriver() })],
})
```

The model now has an `execute_typescript` tool. Inside the program, each moved tool is an `external_*` function, for example `external_list_issues({ state: 'open' })`.

## 2. Pick the isolate

`driver` takes any isolate driver. Change one line to run the programs somewhere else:

| Driver | Package | Runs in |
| --- | --- | --- |
| `createQuickJSIsolateDriver()` | `@tanstack/ai-isolate-quickjs` | WebAssembly, on any runtime |
| `createQuickJSBunIsolateDriver()` | `@tanstack/ai-isolate-quickjs-bun` | Native QuickJS in Bun |
| `createNodeIsolateDriver()` | `@tanstack/ai-isolate-node` | A V8 isolate in Node |
| `createCloudflareIsolateDriver()` | `@tanstack/ai-isolate-cloudflare` | A Cloudflare Worker |
| `createDaytonaIsolateDriver()` | `@tanstack/ai-isolate-daytona` | A Daytona sandbox |
| `createE2BIsolateDriver()` | `@tanstack/ai-isolate-e2b` | An E2B sandbox |

[Code mode isolates](../code-mode/code-mode-isolates) has the options of each driver.

## 3. Choose which tools move

By default, code mode moves only the tools whose calls need no question and no check:

- The tool runs on the server and does not set `needsApproval`.
- The permission rules allow it in plan mode. A tool with an `edit` or `execute` rule stays.
- The tool does not declare `PermissionResources`, so the rules check no path or command of its calls. The coding tools stay.

Where the permission rules come from:

- With [`permissions()`](./permissions) in the plugin list, code mode asks it about each tool. The answer is the one a call gets in plan mode: your `rules` win, and a tool with no rule gets your `default`. So with `default: 'ask'`, a tool with no rule stays.
- Without `permissions()`, code mode reads the rules that tool plugins add.

Every other tool stays a normal tool call, with its approvals.

Code mode also adds `allow` rules for `execute_typescript` and `discover_tools`, so a program itself does not ask, also with `default: 'ask'`. Each call in the program gets the rules of its own tool. Your own `rules` still win: `{ tool: 'execute_typescript', decision: 'ask' }` asks before each program. With `getSnippetBindings`, code mode adds no rule, because a snippet runs code of its own.

To pick the tools yourself, pass `include`:

```ts group=harness-code-mode
export const onlyIssues = codeMode({
  driver: createQuickJSIsolateDriver(),
  include: (tool) => tool.name.endsWith('_issue') || tool.name.endsWith('_issues'),
})
```

- `include` can also pick a tool that asks or that declares `PermissionResources`, for example a [coding tool](#run-the-coding-tools-in-a-program). Each call of such a tool in a program gets the decision of a direct call.
- `include` never moves a tool with `needsApproval`, or a tool that the rules deny in the mode of the session. A `deny` rule with a `resource` also counts, for example `{ tool: 'read_file', resource: '.env', decision: 'deny' }`. Such a tool stays a normal tool call, and code mode writes one warning to the host `logger` (the console by default).
- The rules decide again at each turn, in the permission mode of the session. So in `plan` mode, a tool that edits or runs a command stays a normal tool call.
- A safe tool with `metadata.codeMode: true` moves even when `include` does not pick it.

The other options of `createCodeMode` pass through: `timeout`, `memoryLimit`, `lazyToolsConfig`, and more.

## 4. Send only the tool names

The prompt of code mode lists each moved tool with its full TypeScript type. With 100 tools, that is a lot of tokens on every turn, and most turns use a few tools. Set `lazy: true`, and the prompt lists only the names:

```ts group=harness-code-mode
export const lazyCodeMode = codeMode({
  driver: createQuickJSIsolateDriver(),
  lazy: true,
  lazyToolsConfig: { includeDescription: 'first-sentence' },
})
```

The model then works in three steps:

1. It reads the tool names in the prompt.
2. It calls `discover_tools` with the names it needs, and gets their TypeScript signatures.
3. It calls those tools in `execute_typescript`.

`includeDescription` sets what the prompt shows with each name: `'none'` (the default, the name only), `'first-sentence'`, or `'full'`. Tools that stay outside code mode keep their full schema.

## Run the coding tools in a program

To fix a bug, the model reads a file, edits it, and runs the tests. Each step is a tool call and a model round trip. Move the [coding tools](./coding-tools) into code mode, and one program does all the steps. Each call in the program still gets the [permission rules](./permissions) of its tool.

```ts group=harness-code-mode-coding
import { codeMode } from '@tanstack/ai-code-mode/harness'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'

const root = process.cwd()

export const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    permissions({ root }),
    workspaceTools({ root }),
    codeMode({ driver: createQuickJSIsolateDriver(), include: () => true }),
  ],
})
```

`include: () => true` picks every tool of this harness. Mount `codeMode()` after `workspaceTools()`. Then the program gets the same edit tool as the model: `editStyle` picks `edit_file` or `patch`. With the default `'auto'`, a GPT model gets `patch`.

Each `external_*` call of a coding tool gets the decision of a direct call, for the paths and the commands of the call:

- `allow`: the call runs.
- `deny`: the call throws in the program, with the reason. For example, in `plan` mode a read of `.env` throws `This tool is not allowed in plan mode.`
- `ask`: the program waits for the user. A yes runs the call, and a no makes the call throw.

The prompt of code mode tells the model that these calls can wait and can throw.

### Answer the question

A call that asks opens a [wait](./waits) of kind `question`, with the schema of an approval. The turn does not stop while the program waits. Answer the question with `session.answer`:

```ts group=harness-code-mode-coding
const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(coder, { threadId: 'main' })

const turn = session.send('Run the tests, then fix the first failure.')
const wait = await session.waitForRun({ runId: turn.id })
// wait.kind is 'question'. wait.message is, for example:
// Allow bash {"command":"pnpm test"}? Answer once, always, or reject.
await session.answer({ questionId: wait.waitId, value: 'once' })
```

In a UI, the question is an item of `questions` in a [session view](./custom-ui#show-a-question). In the [CLI](./cli#commands-in-line-mode), type the answer.

```ts group=harness-code-mode-coding
import { createSessionView } from '@tanstack/ai-harness/view'

const view = createSessionView(session)

// Your buttons call this with 'once', 'always', or 'reject'.
async function answerQuestion(answer: 'once' | 'always' | 'reject') {
  const [question] = view.store.get().questions
  await question?.answer(answer)
}
```

- `'once'` runs the call. `'always'` also saves an allow rule, as a direct approval does.
- `'reject'` rejects the call, so it throws. `{ answer: 'reject', message: 'Use pnpm, not npm.' }` also gives the program your message as the error.
- An answer that does not fit the schema, for example `'y'`, gets a `rejected` receipt, and the question stays open.
- The program continues after the answer. Each later call that asks opens a new question.
- In an agent that the model calls as a tool, a call that asks does not run. That agent cannot ask the user, so the call throws.

### Time limits and host stops

A program has 30 seconds by default. With a coding tool in it, the default is 10 minutes, because the wait for the user counts. Set `timeout` in milliseconds to change it. When the time runs out, the program stops, and its open question closes.

With a coding tool, `execute_typescript` is a [durable tool](./durable-tools). The session log keeps the result of each finished call of a coding tool. After a host stop, the next host runs the program again: a finished call returns its kept result, and the same question waits. If the stop cut an edit or a command while it ran, that call throws and does not run again.

## Keep direct calls

A moved tool leaves the tool list of the model. Then the model needs a program even for one small call. Set `directCalls: 'keep'`, and the model can call each moved tool directly too:

```ts group=harness-code-mode
export const keepDirect = codeMode({
  driver: createQuickJSIsolateDriver(),
  directCalls: 'keep',
})
```

- `'remove'` (default): a moved tool is only a function in the program.
- `'keep'`: a moved tool is also a normal tool. A direct call gets its approval, as any tool call does.
- `directCalls` is also a session setting: `session.setPluginSetting({ key: 'directCalls', value: 'keep' })`, or `/config directCalls keep` in the [CLI](./cli#commands-in-line-mode). A change applies from the next turn.
- A client can change it only with `directCalls` in `expose.config`. See [Choose what clients can change](./connect#choose-what-clients-can-change).

## Tools that appear while the session runs

The plugin chooses the tools again before every turn. A plugin that finds tools at run time with `discoverTools` (for example after a sign-in) adds them first, and code mode picks from them on the next turn. Tool names that are not JavaScript identifiers, for example `notion-search`, get a safe name inside the program: `external_notion_search`. When two tools get the same safe name, only the first one moves. The other one stays a normal tool call.

## What you have now

- One `execute_typescript` tool in place of many tool calls.
- Programs that read, edit, and run commands, under the same permission rules as a direct call.
- With `lazy: true`, a prompt that lists only the tool names.
- Programs that run in the isolate you choose.
- An approval for each call that asks, in a program or as a normal tool call.
