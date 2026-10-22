# Harness CLI example

A notes assistant in your terminal, built with `@tanstack/ai-harness` and `@tanstack/ai-harness-cli`. Ask it to write a note. It asks you before it saves the file.

## Run it

From the repo root:

1. `pnpm install`
2. `pnpm build:all` (the example uses the local packages)
3. `OPENAI_API_KEY=sk-... pnpm --filter harness-cli-example start`

Type `Save a note about the moon landing`. The screen shows the `save_note` call. Press `y`, and the note is in `examples/harness-cli/notes/`.

## What is in it

- `src/harness.ts`: the harness. One model, a `list_notes` tool, and a `save_note` tool that needs approval.
- `src/cli.ts`: `runCli(assistant, { ui: runTui })`. That is the whole entry file.
- `src/tui.tsx`: an Ink screen on the session view. It shows the messages, tool calls, child agents, sign-ins, approvals (`y` or `n`), and questions.

## Other modes

The same entry file has every mode of `runCli`. Run these from `examples/harness-cli`:

- `pnpm start -p "List my notes"` runs one prompt and prints the answer.
- `echo "List my notes" | pnpm start` uses line mode.
- `pnpm start --serve` serves the session protocol over HTTP with a bearer token.

Read [Run a harness in the terminal](../../docs/harness/cli.md) and [Build your own UI](../../docs/harness/custom-ui.md).
