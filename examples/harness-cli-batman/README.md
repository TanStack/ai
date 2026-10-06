# Batman CLI (TanStack AI harness)

A Batman-themed coding agent in your terminal. Same stack as
[`harness-cli`](../harness-cli): `@tanstack/ai-harness`, `runCli`, and the
Ink screen. The cave is yellow and black. Bats fly. The agent talks like
Batman.

This example lives on the harness stack from
[PR 1555](https://github.com/TanStack/ai/pull/1555).

## Run it

From the repo root of this worktree:

1. `pnpm install`
2. `pnpm build:all` (the example uses the local packages)
3. `pnpm --filter harness-cli-batman start`
4. Type `/connect` and pick OpenRouter. It signs you in with the browser.
5. Type `/model`, pick OpenRouter, then a model.

Now send a message. Batman answers.

A key skips the splash.

## What you see

- Bats fly across the boot splash. Then **BATMAN** in block letters. Then
  the line `I AM THE NIGHT`.
- The header is the Bat-signal yellow. Features that are on show a bat.
- The input prompt is a bat. Status says `patrolling Gotham` while a turn
  runs.
- The agent speaks as Batman. The demo model does too, until you connect a
  key.

Sessions and keys are in `~/.tanstack-harness-batman`, so they stay apart
from the plain harness CLI example.

## Everything else

The rest matches [the harness CLI example](../harness-cli/README.md): files
in the folder where you start, `/connect`, voice, media, Claude Code and
Codex, Notion and Linear, skills, `/resume`, `--serve`, `--mcp`, and the
dashboard.

```sh
pnpm --filter harness-cli-batman start
pnpm --filter harness-cli-batman start --resume
pnpm --filter harness-cli-batman start -p "list the files"
```
