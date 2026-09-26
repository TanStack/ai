# Harness CLI example

A small coding agent in your terminal, built with `@tanstack/ai-harness`. It reads and edits files in `./playground`, asks before it writes a file or runs a command, keeps a todo list, and can switch models.

## Run it

From the repo root:

1. `pnpm install`
2. `pnpm build:all` (the example uses the local packages)
3. Set a key: `OPENAI_API_KEY=...` or `ANTHROPIC_API_KEY=...`. Without one, a demo model answers.
4. `pnpm --filter harness-cli-example start`

Try these:

- `create hello.txt with a short poem`: the agent asks before `write_file`. Type `y`.
- `/mode plan`, then ask for another file: the write is refused.
- `/todos`, `/usage`, `/model fast`, `/agents`
- `/agent haiku {"topic":"rain"}`: runs a typed agent in the background.
- Press Esc to stop a long answer. Type while it works to steer it.

## Other modes

- One prompt for scripts and CI: `pnpm --filter harness-cli-example start -p "list the files"`
- AG-UI events as JSON lines: add `--output ndjson`.
- As an editor agent (ACP): `pnpm --filter harness-cli-example start --acp`
- As an HTTP server: `pnpm --filter harness-cli-example start --serve` (it prints a token).

## Watch it from a browser or a phone

1. In one terminal: `pnpm --filter harness-cli-example dashboard`. It prints a sign-in link.
2. In another: `pnpm --filter harness-cli-example start --dashboard http://127.0.0.1:8790`. It prints a pairing code.
3. Open the sign-in link, approve the code, and open the `main` session. Messages you send there reach the agent.
