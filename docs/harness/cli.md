---
title: Run a harness in the terminal
id: harness-cli
order: 3
description: "Give your harness a terminal UI, a print mode for scripts and CI, NDJSON output, an ACP mode for editors, and an HTTP server."
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

The interactive UI uses Ink, which needs Node 22 or later.

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

- No flags: the interactive UI. Type a message and press Enter. While the agent works, Enter steers it and Esc cancels.
- `-p "prompt"`: run one prompt, print the answer, and exit.
- `-p "prompt" --output ndjson`: print every AG-UI event as one JSON line.
- `--acp`: serve the harness as an ACP v2 agent over stdio, for editors. Needs `@tanstack/ai-acp`.
- `--serve`: serve the session protocol over HTTP on `127.0.0.1:8787`. Every request needs the bearer token. Pass `--token`, set `HARNESS_TOKEN`, or copy the token the CLI prints.

When stdin is a pipe, the CLI reads one message or command per line and waits for each turn.

## 3. Use it in CI

`-p` exits with a code your script can check:

| Code | Meaning |
|---|---|
| 0 | The turn finished. |
| 1 | The turn failed. |
| 2 | The turn waits for an approval. |
| 130 | The turn was cancelled. |

## Commands in the interactive UI

- `/agents`: list the agents.
- `/agent <name> {"json":"input"}`: run an agent in the background. When it is done, a new turn starts with its result.
- `/cancel`: cancel the running turn.
- `/status`: show what runs and what waits.
- `/exit`: quit.

When a turn stops for an approval, type `y` to approve or `n` to reject.

## What you have now

- One entry file that runs your harness as a terminal app, a script step, an editor agent, or a server.

Next: keep long turns alive through crashes with [durable sessions](./durable-sessions).
