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
  adapter: openaiText('gpt-6.1-sol'),
})

process.exitCode = await runCli(assistant)
```

## 2. Pick a mode

To use the harness yourself:

- No flags: line mode. Type a message and press Enter. With a `ui`, your own screen starts in its place (see [Run your own screen](#run-your-own-screen)).
- `-p "prompt"`: run one prompt, print the answer, and exit.
- `-p "prompt" --output ndjson`: print every AG-UI event as one JSON line.

To use the harness from another program:

- `--acp`: serve the harness as an ACP v2 agent over stdio, for editors. Needs `@tanstack/ai-acp` with harness support.
- `--mcp`: serve the harness as an MCP server over stdio, for Claude Code, Cursor, and other MCP clients. Needs `@tanstack/ai-mcp` with harness support. Add `--yes` to approve every tool call.
- `--serve`: serve the session protocol over HTTP on `127.0.0.1:8787`. Every request needs the bearer token. Pass `--token`, set `HARNESS_TOKEN`, or copy the token the CLI prints. With `@tanstack/ai-mcp` and its harness support, it also serves MCP at `/mcp`. One token, one user, every thread, so keep it on a network you trust (see [Serve over HTTP safely](#serve-over-http-safely)).

`--mcp` and `--serve` run only the commands in `expose.commands` of the harness. `--serve` also sets only the config keys in `expose.config`. Add the names to `expose` in `defineHarness`, for example `expose: { commands: ['connect:github'] }`. Line mode and `-p` run every command. See [Choose what clients can change](./connect#choose-what-clients-can-change).

Line mode reads one message or command per line. In a terminal, you can type while a turn runs:

- `/cancel` cancels the running turn at once.
- A message joins the running turn as a steer. The model reads it at its next call.
- A message that you type when no turn runs starts a new turn.

With piped input, each line waits for the turn that the line before it started. A script runs in order. In a terminal, line mode also opens sign-in links in the browser.

## 3. Use it in CI

`-p` exits with a code your script can check:

| Code | Meaning |
|---|---|
| 0 | The turn finished. |
| 1 | The turn failed. |
| 3 | The turn waits for a person: an approval, an answer, or a sign-in. |
| 130 | The turn was cancelled, or SIGINT (Ctrl+C) stopped the CLI. |
| 143 | SIGTERM cancelled the turn or stopped the CLI. |

`EXIT` from `@tanstack/ai-harness-cli` has these codes, for example `EXIT.needsAction` (3). `-p` exits 3 at the first [wait](./waits) of the turn, because nobody can answer in this mode. It writes what the turn waits for on stderr. On a durable host, the wait stays in the log, so a later run, or another server, can answer it.

The codes 130 and 143 apply in every mode. See [Stop with Ctrl+C](#stop-with-ctrlc).

## Stop with Ctrl+C

Ctrl+C works the same in every mode:

- The first Ctrl+C (SIGINT) or SIGTERM cancels the running turn.
- A second one, or one while no turn runs, stops the CLI. `runCli` resolves to 130 for SIGINT, and to 143 for SIGTERM.
- When the CLI made the host, it closes the host with `recoverable: true`. Another host then runs the cut work again.
- When you gave the CLI your own `host`, the CLI releases only its session handle. Your host stays open.

The CLI hears the signals on `process`. To send them yourself, for example in a test, pass a `signals` source. An `EventEmitter` works:

```ts group=harness-cli-signals
import { EventEmitter } from 'node:events'
import { defineHarness } from '@tanstack/ai-harness'
import { runCli } from '@tanstack/ai-harness-cli'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const signals = new EventEmitter()
const exit = runCli(assistant, { argv: ['-p', 'Write a long story.'], signals })
// No turn runs yet, so this stops the CLI.
signals.emit('SIGTERM')
console.log(await exit) // 143
```

## Serve over HTTP safely

`--serve` is the quick way to put a harness on HTTP, so it makes the trust decisions for you: one bearer token, one user, every thread. Anyone with the token acts as that one user. They can open or drive any thread on the host, including the tools it runs (shell commands, file edits) on the machine the CLI runs on. Treat the token like a shell login.

- It binds to `127.0.0.1:8787`, reachable only from the same machine. Change the bind with `--host` and `--port`. `--host 0.0.0.0` puts it on the network, so do that only behind TLS and a proxy you trust.
- The CLI signs media links with its own key, never with the token. By default it makes a new random key at each start, so media links stop working after a restart. To keep them working, pass `--media-key` or set `HARNESS_MEDIA_KEY`, with a key of at least 32 bytes. Change the key to stop every link a turn already handed out.

Need per-user access, your own sign-in check, or a rule for which threads each user can open? Use [`createHarnessHandler`](./connect) on a host with [`access`](./access) instead. The host reads the user of each request and checks each action, so no thread is open by accident.

## Use your own host and user

By default, the CLI builds its own host in memory and opens sessions with no user. Your server already has a durable host with its own stores, and each person has their own credentials. Give the CLI that host and the user:

```ts group=harness-cli-host
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { runCli } from '@tanstack/ai-harness-cli'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({
  persistence: memoryPersistence(),
  credentials: memoryCredentialStore(),
})

process.exitCode = await runCli(assistant, { host, user: { id: 'ada' } })
await host.close()
```

- You own the host, so the CLI does not close it. Close it yourself when `runCli` returns. Without `host`, the CLI builds a host and closes it.
- Give `host`, or `persistence` and `credentials`, not both. With both, `runCli` writes `Give runCli a host, or persistence and credentials, not both.` and returns code 1.
- Line mode, `-p`, your own `ui`, `--acp`, and `--mcp` open their sessions as `user`, so `/connect` saves keys for that user.
- `--serve` checks the token first. On a host without `access`, each request then runs as `user`. On a host with [`access`](./access), `getUser` reads the user of each request.
- On a host with `access`, give `user` too. `--mcp` does not start on such a host, because stdio has no login.

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

Plugin commands (for example `/model` or `/todos`) show up in `/help`.

When a turn waits for you, each next line answers one wait, in order. The turn continues after the last one:

- An approval: `y` approves and `n` refuses. An approval of `permissions()` also takes `once`, `always`, or `reject`.
- A question: type the answer. The CLI reads it with the schema of the question.
- A sign-in: sign in, then type `y` to go on, or `n` to skip it.
- A client tool: the terminal cannot run it. Any line skips it.

## Send files and save media

To send a file with a message, write `@` and the path of the file:

```text
what is wrong in @./bug.png
compare @"old logo.png" with @./new-logo.png
```

- The path is relative to the working folder. Put quotes around a path with spaces.
- `@path` works in line mode, with `-p`, with piped input, and in your own `ui`.
- A `@word` that is not a file stays in the text, for example `@types/node`.
- If the CLI does not know the type of the file, it does not send the message. To send the path as text, remove the `@`.

The CLI saves the media that a turn makes in a folder. The default folder is `./<harness name>-media` in the working folder, for example `./acme-assistant-media`. To use another folder, add `--media-dir <dir>`:

```bash
npx tsx cli.ts -p "Draw a logo for acme" --media-dir ./out
```

- Line mode prints `[image saved: <path>]` for each file.
- `-p` prints the same line on stderr, so stdout keeps only the answer.
- `-p --output ndjson` adds the saved `path` to the value of the `harness.media` event.

The CLI never replaces a file. If the name is taken, it adds `-1`, `-2`, and so on to the new name.

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

- `ui` runs only in an interactive terminal. Piped input uses line mode. `-p`, `--acp`, `--mcp`, and `--serve` do not use `ui`.
- When `ui` resolves, the CLI disposes the view and `runCli` returns.
- In a reopened thread, a saved child agent shows only its card. To show what it wrote, call `view.loadAgent({ id })`, for example when the screen draws the card. See [Show subagents](./custom-ui#show-subagents).
- To write `Screen`, read [Build your own UI](./custom-ui).

For an Ink screen with approvals, questions, sign-ins, and child agents, copy [`examples/harness-cli/src/tui.tsx`](https://github.com/TanStack/ai/blob/main/examples/harness-cli/src/tui.tsx).

## What you have now

- One entry file that runs your harness as a terminal app, a script step, an editor agent, an MCP server, or an HTTP server.
- A CLI that uses your durable host and runs as your user.
- A Ctrl+C that cancels the turn first, then stops with exit code 130.
- Exit code 3 from `-p` when a turn waits for a person, and one line for each answer in line mode.
- Your own terminal screen on the same session, with any TUI library.
- Files that you send with `@path`, and a folder with the media that your agents make.

Next: keep long turns alive through crashes with [durable sessions](./durable-sessions).
