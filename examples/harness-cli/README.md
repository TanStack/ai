# Harness CLI example

A small coding agent in your terminal, built with `@tanstack/ai-harness`. It reads and edits files in `./playground`, asks before it writes a file or runs a command, keeps a todo list, and can switch models. It can also read Notion and Linear, and make images and videos.

## Run it

From the repo root:

1. `pnpm install`
2. `pnpm build:all` (the example uses the local packages)
3. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Without a key, a demo model answers.
4. `pnpm --filter harness-cli-example start`

Try these:

- `create hello.txt with a short poem`: the agent asks before `write_file`. Type `y`.
- `/mode plan`, then ask for another file: the write is refused.
- `/todos`, `/usage`, `/model fast`
- `/goal create a file hello.txt that says hi`: the agent keeps working until the model says the goal is met. `/goal` shows the status.
- Press Esc to stop a long answer. Type while it works to steer it.

## The terminal screen

In a terminal, `start` shows an Ink screen. The screen is `src/tui.tsx`, and `src/cli.ts` gives it to `runCli` as `ui`. It is plain example code on `createSessionView`, so copy it and change it.

- It shows the messages, tool calls, child agents, approvals, questions, sign-ins, the goal, and the status.
- It has `/help`, `/connect <id>`, `/disconnect <id>`, and `/exit`. Other commands, for example `/todos`, go to the plugins.
- It opens sign-in links in the browser.

Piped input uses line mode. Line mode also has `/agents` and `/agent <name> [json]`, which runs a typed agent in the background:

```bash
echo /agents | pnpm --filter harness-cli-example start
echo '/agent haiku {"topic":"rain"}' | pnpm --filter harness-cli-example start
```

## Use Notion, Linear, images, and video

1. Run `/connect notion`. Approve the consent page that opens in the browser. Do the same with `/connect linear`.
2. Ask: `find my latest Linear issue, look for a related Notion page, then make an image and a short video about it`.
3. The harness keeps each file. The CLI saves it in `example-coder-media` and prints `[image saved: <path>]`. Change the folder with `--media-dir <dir>`.
4. To send a file, put `@` before its path: `describe @./playground/cat.png`.

- Sign-ins are kept in `~/.tanstack-harness-example/credentials.json`, so you sign in once. `/disconnect notion` deletes one.
- Images use `OPENAI_API_KEY`. Videos use Grok Imagine when `XAI_API_KEY` is set, and OpenAI Sora when it is not.
- Code mode is on: read-only tools (file reads, read-only Notion and Linear tools) are `external_*` functions in one `execute_typescript` program, which runs in a QuickJS isolate. Ask: `in one program, list my Linear issues and search Notion for them`.

## Hand work to Claude Code and Codex

1. Sign in to the CLIs once: `claude login` and `codex login`.
2. Start with `CODING_AGENTS=1`. If you use Codex with a ChatGPT login, also set `CODEX_MODEL` to the model in `~/.codex/config.toml`.
3. Ask: `have claude_code create notes.md with one line, then have codex add a second line`.

- Both agents work in `./playground` with your own logins. The API keys are removed from their processes.
- The screen shows each agent with its status, its tool calls, and its latest text. `/fresh` starts new agent sessions.
- On Windows, the Codex sandbox can block the folder (Access is denied). Then set `CODEX_SANDBOX_MODE=danger-full-access`, only for a folder you trust.

## Other modes

- One prompt for scripts and CI: `pnpm --filter harness-cli-example start -p "list the files"`
- AG-UI events as JSON lines: add `--output ndjson`.
- As an editor agent (ACP): `pnpm --filter harness-cli-example start --acp`
- As an HTTP server: `pnpm --filter harness-cli-example start --serve` (it prints a token).

## Watch it from a browser or a phone

1. In one terminal: `pnpm --filter harness-cli-example dashboard`. It prints a sign-in link.
2. In another: `pnpm --filter harness-cli-example start --dashboard http://127.0.0.1:8790`. It prints a pairing code.
3. Open the sign-in link, approve the code, and open the `main` session. Messages you send there reach the agent.
