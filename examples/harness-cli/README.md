# Harness CLI example

A coding agent in your terminal, built with `@tanstack/ai-harness`. Talk to it or type. It edits files in `./playground`, makes images, video, speech, songs, and sound effects, reads Notion and Linear, and hands coding work to your local Claude Code and Codex.

## Run it

From the repo root:

1. `pnpm install`
2. `pnpm build:all` (the example uses the local packages)
3. `pnpm --filter harness-cli-example start`
4. Type `/connect` and pick OpenRouter. It signs you in with the browser, with no key to paste.
5. Type `/model` and pick `openai/gpt-6-astra`.

Now send a message.

## Connect your models

You do not need a `.env` file. Type `/connect` and pick a provider from the list:

- OpenRouter signs you in with the browser. OpenRouter gives the app a key.
- OpenAI, Anthropic, xAI, and fal have no browser sign-in for other apps. The page to make a key opens in the browser. Paste the key: the input shows dots, not the key.
- `/connect openai` skips the list. `/keys` shows where each key comes from (saved, an env var, or missing).
- `/disconnect` removes a saved key.

The app saves the key in `~/.tanstack-harness-example/credentials.json`. It shows only the last 4 characters of a key. The footer shows which features are on, and it changes when you connect a provider.

| Provider id  | Adds                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `openai`     | `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, images, speech, Sora video, and voice input               |
| `anthropic`  | `claude-opus-5-5`, `claude-fable-5-1`, `claude-sonnet-5`, `claude-haiku-4-5`                        |
| `grok`       | `grok-4.7`, `grok-4.6`, video with Grok Imagine, and voice input                                    |
| `fal`        | songs and sound effects                                                                             |
| `openrouter` | `openai/gpt-6-astra`, `anthropic/claude-opus-5.5`, `google/gemini-3.1-pro-preview`, `x-ai/grok-4.7` |

If a provider has no key, its models and tools stop and tell you which `/connect` to run. If no key is set in the env, `/model demo` answers without a key.

### Developer shortcut: a `.env` file

1. Copy `.env.example` to `.env`.
2. Set the keys that you have.

An env var works when no key is saved. The first model with an env key starts. Audio files that you attach with `@file` become text only when `OPENAI_API_KEY` is set. Voice messages use the saved key.

### Ship it to your users

`src/harness.ts` wraps each model in `keyedAdapter`, and the `providerKeys` plugin adds `/connect`, `/disconnect`, and `/keys`. The harness saves the keys of each user in its credential store: a file here, your database in a hosted app. The guide is [Connect model providers](../../docs/harness/provider-keys.md).

## Talk to it

Hold Ctrl+R while you talk, and let go to send. Or tap Ctrl+R, talk, and tap it again. The meter shows that the microphone hears you.

- Name a file, and it is sent too: "describe fox dot png", "use cat.png as a reference".
- Say "the last image" (or video, song) for the last file the agent made: "make a pencil sketch of the last image".
- Say "Hey, run a Codex agent that adds a test": Codex runs in its own card, and the screen shows its output.

The first recording listens on every microphone, and keeps the one that heard you clearest. `/mic` lists them, and `/mic 3` picks the third one. The choice is kept in `~/.tanstack-harness-example/voice.json`.

- A silent recording (a muted microphone) is not sent.
- Set `VOICE_LANGUAGE=en` (or your language) so the transcript is in that language.
- `/voice note.m4a` sends a voice message that you recorded before.

Voice needs `ffmpeg` on the PATH, and an OpenAI or xAI key for the transcript (`/connect openai` or `/connect grok`).

## Make media

Ask in words. The agent picks the tool:

- `make an image of a red fox in the snow`
- `make a watercolor version of @./playground/fox.png`: the image tool uses the images you send as references.
- `read this aloud with the nova voice: hello`
- `compose a 30 second synth-pop song about foxes, with the lyrics "fox in the snow"`
- `make a 5 second sound effect of rain on a window`
- `make a short video of snow in a pine forest` (a minute or two)

Each tool needs the key of its provider (see [Connect your models](#connect-your-models)).

The harness keeps each file, and the screen saves it in `example-coder-media` with a number. `/open 2` opens file 2, and `/play` plays the last song or speech (with `ffplay` from ffmpeg).

## Hand work to Claude Code and Codex

When `claude` and `codex` are on the PATH, the agent can call them. They work in `./playground` with your own `claude login` and `codex login`, and the API keys are removed from their processes.

- Ask: `have codex create notes.md with one line, then have claude code add a second line`.
- The screen shows each agent with its status, its tool calls, and its output. When it ends, the last lines of its answer stay.
- Codex uses the `model` and `sandbox_mode` of your `~/.codex/config.toml`. `CODEX_MODEL` and `CODEX_SANDBOX_MODE` change them.
- On Windows, the `workspace-write` sandbox of Codex can block the folder (Access is denied). Then use `danger-full-access`, only for a folder you trust.

## Use Notion and Linear

1. Run `/connect notion`. Approve the consent page that opens in the browser. The screen waits with a spinner, then shows a green `✓ Connected to Notion.` Do the same with `/connect linear`.
2. Ask: `list the titles of my 3 latest Linear issues`, or `search Notion for the onboarding page`.

- Sign-ins are kept in `~/.tanstack-harness-example/credentials.json`, so you sign in once. `/disconnect notion` deletes one.
- Code mode is on: read-only tools (file reads, read-only Notion and Linear tools) are functions in one `execute_typescript` program, which runs in a QuickJS isolate.

## Pick the model and the effort

- `/model` opens a list of the models, with the provider and the context size of each. `/model gpt-6-luna` switches at once. The change applies at the next turn.
- `/effort` sets how hard the model thinks: `default` (the model decides), `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. It sets `chat({ reasoning })`, so a level the model does not have moves to the nearest one it has.
- The footer shows the model, the effort, how full the context is, the tokens in and out, and the model calls.

## The screen

- Answers show as markdown: lists, tables, and highlighted code. A Mermaid block shows as a chart drawn in text. In demo mode, ask `draw me a chart`.
- Type `/` for a list of the commands. The arrows move in it, Tab fills the command, and Enter runs it.
- The up and down arrows go through the lines you sent, also after a restart. They are kept in `~/.tanstack-harness-example/history.json`. Keys are never kept.
- The input stays at the bottom of the screen. `/help` lists every command.

## Everything else it shows

- `create hello.txt with a short poem`: the agent asks before `write_file`. Type `y`.
- `/mode plan` makes it read-only. `/todos`, `/usage`, `/compact`.
- `/goal create a file hello.txt that says hi`: the agent keeps working until the model says the goal is met.
- Press Esc to stop a long answer. Type while it works to steer it.

The screen is `src/tui.tsx` and its parts in `src/screen/`, plain example code on `createSessionView`. `src/voice.ts` records and transcribes, and `src/media.ts` has the media agents. Copy them and change them.

## Other modes

- Piped input uses line mode: `echo '/agent haiku {"topic":"rain"}' | pnpm --filter harness-cli-example start`
- One prompt for scripts and CI: `pnpm --filter harness-cli-example start -p "list the files"`. Add `--output ndjson` for AG-UI events as JSON lines.
- As an editor agent (ACP): `pnpm --filter harness-cli-example start --acp`
- As an MCP server for Claude Code or Cursor: `pnpm --filter harness-cli-example start --mcp`
- As an HTTP server: `pnpm --filter harness-cli-example start --serve` (it prints a token).

## Watch it from a browser or a phone

1. In one terminal: `pnpm --filter harness-cli-example dashboard`. It prints a sign-in link.
2. In another: `pnpm --filter harness-cli-example start --dashboard http://127.0.0.1:8790`. It prints a pairing code.
3. Open the sign-in link, approve the code, and open the `main` session. Messages you send there reach the agent.
