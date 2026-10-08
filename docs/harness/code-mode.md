---
title: Code mode in a harness
id: harness-code-mode
order: 10
description: "Let the harness model write one TypeScript program that calls many tools, and run it in an isolate. Any TanStack AI isolate driver plugs in."
keywords:
  - tanstack ai
  - harness
  - code mode
  - isolate
  - quickjs
---

Your agent has 100 tools from Notion and Linear, and it calls them one at a time. Each call is a model round trip, and every tool schema goes into every request. With code mode, the model writes one TypeScript program that calls the tools it needs, and the program runs in an isolate. The read-only tools leave the tool list and become functions in that program.

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
import { defineHarness } from '@tanstack/ai-harness'
import { codeMode } from '@tanstack/ai-code-mode/harness'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { mcpConnector } from '@tanstack/ai-mcp/connector'
import { openaiText } from '@tanstack/ai-openai'

const linear = mcpConnector({
  id: 'linear',
  label: 'Linear',
  url: 'https://mcp.linear.app/mcp',
})

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
  plugins: () => [
    linear,
    codeMode({ driver: createQuickJSIsolateDriver() }),
  ],
})
```

The model now has an `execute_typescript` tool. Inside the program, each moved tool is an `external_*` function, for example `external_linear_list_issues()`.

## 2. Pick the isolate

`driver` takes any isolate driver. Change one line to run the programs somewhere else:

| Driver | Package | Runs in |
| --- | --- | --- |
| `createQuickJSIsolateDriver()` | `@tanstack/ai-isolate-quickjs` | WebAssembly, on any runtime |
| `createNodeIsolateDriver()` | `@tanstack/ai-isolate-node` | A V8 isolate in Node |
| `createCloudflareIsolateDriver()` | `@tanstack/ai-isolate-cloudflare` | A Cloudflare Worker |
| `createDaytonaIsolateDriver()` | `@tanstack/ai-isolate-daytona` | A Daytona sandbox |

[Code mode isolates](../code-mode/code-mode-isolates) has the options of each driver.

## 3. Choose which tools move

A call inside the program does not stop for approval. So by default, a tool moves into code mode only when it is safe to run without a question:

- The tool runs on the server and does not set `needsApproval`.
- The permission rules allow it in plan mode. File reads move. `write_file` and `bash` stay.
- MCP tools that the server does not mark read-only ask for approval, so they stay too.

Where the permission rules come from:

- With [`permissions()`](./permissions) in the plugin list, code mode asks it about each tool. The answer is the one a call gets in plan mode: your `rules` win, and a tool with no rule gets your `default`. So with `default: 'ask'`, a tool with no rule stays.
- Without `permissions()`, code mode reads the rules that tool plugins add.

Every other tool stays a normal tool call, with its approvals. To pick the tools yourself, pass `include`:

```ts group=harness-code-mode
export const onlyLinear = codeMode({
  driver: createQuickJSIsolateDriver(),
  include: (tool) => tool.name.startsWith('linear_'),
})
```

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

## Tools that appear after sign-in

The plugin chooses the tools again before every turn. When the user runs `/connect linear`, the read-only Linear tools move into code mode on the next turn. A plugin can do the same with its own tool changes: return the new list from `prepareTools`. [Use MCP servers](./mcp) shows `discoverTools`, which adds the tools first.

## What you have now

- One `execute_typescript` tool in place of many read-only tools.
- With `lazy: true`, a prompt that lists only the tool names.
- Programs that run in the isolate you choose.
- Approvals kept for every tool that can change something.
