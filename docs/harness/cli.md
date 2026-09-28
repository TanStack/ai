---
title: Run a harness in the terminal
id: harness-cli
order: 3
description: "Run your harness in a terminal with line mode or your own screen, a print mode for scripts and CI, NDJSON output, an ACP mode for editors, and an HTTP server."
keywords:
  - tanstack ai
  - harness
  - cli
  - terminal
  - ink
---

You built a harness and want to use it like Claude Code: type in a terminal, watch it work, approve tools. You also want to run it in CI. `runCli` gives one harness all of these modes.

## Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-harness-cli
vue: @tanstack/ai-harness-cli
solid: @tanstack/ai-harness-cli
svelte: @tanstack/ai-harness-cli
preact: @tanstack/ai-harness-cli
angular: @tanstack/ai-harness-cli
vanilla: @tanstack/ai-harness-cli
octane: @tanstack/ai-harness-cli

<!-- ::end:tabs -->

## 1. Write the entry file

```ts group=harness-cli
import { defineHarness } from '@tanstack/ai-harness'
import { runCli } from '@tanstack/ai-harness-cli'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
})

process.exitCode = await runCli(assistant)
```

## 2. Pick a mode

To use the harness yourself:

- No flags: line mode. Type a message and press Enter. With a `ui`, your own screen starts in its place (see [Run your own screen](#run-your-own-screen)).
- `-p "prompt"`: run one prompt, print the answer, and exit.
- `-p "prompt" --output ndjson`: print every AG-UI event as one JSON line.

To use the harness from another program:

- `--acp`: serve the harness as an ACP v2 agent over stdio, for editors. Needs `@tanstack/ai-acp`.
- `--mcp`: serve the harness as an MCP server over stdio, for Claude Code, Cursor, and other MCP clients. Needs `@tanstack/ai-mcp`. Add `--yes` to approve every tool call. Read [Use a harness from any MCP client](./mcp-server).
- `--serve`: serve the session protocol over HTTP on `127.0.0.1:8787`. Every request needs the bearer token. Pass `--token`, set `HARNESS_TOKEN`, or copy the token the CLI prints. With `@tanstack/ai-mcp`, it also serves MCP at `/mcp`.

Line mode reads one message or command per line and waits for each turn. It works the same in a terminal and with piped input. In a terminal, it also opens sign-in links in the browser.

## 3. Use it in CI

`-p` exits with a code your script can check:

| Code | Meaning |
|---|---|
| 0 | The turn finished. |
| 1 | The turn failed. |
| 2 | The turn waits for an approval. |
| 130 | The turn was cancelled. |

## Commands in line mode

For the session:

- `/agents`: list the agents.
- `/agent <name> {"json":"input"}`: run an agent in the background. When it is done, a new turn starts with its result.
- `/config`: show the settings. `/config <key> <value>` changes one.
- `/connect <id>` and `/disconnect <id>`: sign in to a connector, or out.

For the running work:

- `/cancel`: cancel the running turn.
- `/status`: show what runs and what waits.
- `/exit`: quit.

Plugin commands (for example `/model` or `/todos`) show up in `/help`. When a turn stops for an approval or a plugin asks a question, type your answer. For yes-or-no questions, `y` approves and `n` refuses.

## Run your own screen

Line mode prints plain lines. For a full screen with your own layout, pass `ui` to `runCli`. It works with any TUI library, for example Ink, OpenTUI, or blessed.

`ui` gets a ready [session view](./custom-ui) and resolves when the user quits. This entry file starts an Ink screen:

```tsx ignore
import { render } from 'ink'
import { runCli } from '@tanstack/ai-harness-cli'
import { assistant } from './harness'
import { Screen } from './screen'

process.exitCode = await runCli(assistant, {
  ui: async (view) => {
    await render(<Screen view={view} />).waitUntilExit()
  },
})
```

- `ui` runs only in an interactive terminal. Piped input uses line mode. `-p`, `--acp`, `--mcp`, `--serve`, and `--dashboard` do not use `ui`.
- When `ui` resolves, the CLI disposes the view and `runCli` returns.
- To write `Screen`, read [Build your own UI](./custom-ui).

For a full Ink screen with approvals, questions, sign-ins, and child agents, copy [`examples/harness-cli/src/tui.tsx`](https://github.com/TanStack/ai/blob/main/examples/harness-cli/src/tui.tsx).

## What you have now

- One entry file that runs your harness as a terminal app, a script step, an editor agent, an MCP server, or an HTTP server.
- Your own terminal screen on the same session, with any TUI library.

Next: keep long turns alive through crashes with [durable sessions](./durable-sessions).
