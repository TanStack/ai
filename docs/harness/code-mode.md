---
title: Code mode in a harness
id: harness-code-mode
order: 13
description: "Let the harness model write one TypeScript program that calls many tools, and run it in an isolate. Any TanStack AI isolate driver plugs in."
keywords:
  - tanstack ai
  - harness
  - code mode
  - isolate
  - quickjs
---

Your agent has many read-only tools, and it calls them one at a time. Each call is a model round trip, and every tool schema goes into every request. With code mode, the model writes one TypeScript program that calls the tools it needs, and the program runs in an isolate. The read-only tools leave the tool list and become functions in that program.

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

A call inside the program does not stop for approval. So by default, a tool moves into code mode only when it is safe to run without a question:

- The tool runs on the server and does not set `needsApproval`.
- The permission rules allow it in plan mode. A tool with an `edit` or `execute` rule stays.
- The tool does not declare `PermissionResources`. Calls inside the program skip the permission checks, so such a tool stays a normal tool call.

Where the permission rules come from:

- With [`permissions()`](./permissions) in the plugin list, code mode asks it about each tool. The answer is the one a call gets in plan mode: your `rules` win, and a tool with no rule gets your `default`. So with `default: 'ask'`, a tool with no rule stays.
- Without `permissions()`, code mode reads the rules that tool plugins add.

Every other tool stays a normal tool call, with its approvals. With this default pick, code mode also adds `allow` rules for `execute_typescript` and `discover_tools`, so a program does not ask when every tool in it is safe. Your own `rules` still win.

To pick the tools yourself, pass `include`:

```ts group=harness-code-mode
export const onlyIssues = codeMode({
  driver: createQuickJSIsolateDriver(),
  include: (tool) => tool.name.endsWith('_issue') || tool.name.endsWith('_issues'),
})
```

- `include` never moves a tool with `needsApproval`, or a tool that an `ask` or `deny` rule matches. That tool stays a normal tool call with its approval, and code mode warns once. The rules decide in the permission mode of the session, again at each turn. So in `plan` mode, a tool that edits stays a normal tool call.
- Any other tool that `include` picks moves, also when a rule asks for it. Its calls inside the program do not ask, so pick only tools that are safe to run without a question.
- With `include`, a call of `execute_typescript` gets the permission rules like any tool, for example a question with `default: 'ask'`.
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

## Tools that appear while the session runs

The plugin chooses the tools again before every turn. A plugin that finds tools at run time with `discoverTools` (for example after a sign-in) adds them first, and the safe ones move into code mode on the next turn. Tool names that are not JavaScript identifiers, for example `notion-search`, get a safe name inside the program: `external_notion_search`. When two tools get the same safe name, only the first one moves. The other one stays a normal tool call.

## What you have now

- One `execute_typescript` tool in place of many read-only tools.
- With `lazy: true`, a prompt that lists only the tool names.
- Programs that run in the isolate you choose.
- Approvals kept for every tool that stays a normal tool call.
