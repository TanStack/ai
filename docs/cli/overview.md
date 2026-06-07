---
title: ts-ai CLI
id: cli-overview
order: 1
description: "Run TanStack AI from the terminal or any agent harness with the ts-ai CLI — chat, image, video, audio, speech, transcribe, and summarize, with JSON output, AG-UI streaming, and a self-describing manifest."
keywords:
  - tanstack ai
  - cli
  - ts-ai
  - agent harness
  - json output
---

`@tanstack/ai-cli` installs the `ts-ai` binary — a thin, type-safe CLI over the
core TanStack AI activities. It is built **machine-first**: every command is a
stateless, single-shot subprocess with structured I/O, so it drops cleanly into
an agent harness — while still giving humans a pretty, interactive experience on
a TTY.

## Install

```bash
# Zero-install one-off
npx @tanstack/ai-cli image "a watercolor fox" -o fox.png

# Or install globally
pnpm add -g @tanstack/ai-cli
ts-ai --version
```

OpenAI, Anthropic, Gemini, OpenRouter, and Fal are bundled, so those providers
work with no extra install. Other providers (Ollama, Grok, Groq, ElevenLabs)
are loaded on demand — if one isn't installed, `ts-ai` exits with code `4` and
tells you which package to add.

## Choosing a model and key

Pick a model with a `provider/model` slug. The API key comes from `--apiKey`
or, by default, the conventional environment variable for that provider
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`,
`FAL_KEY`).

```bash
ts-ai chat "Explain MCP in one sentence" --model openai/gpt-5.5
ts-ai chat "Summarize this PR" --model anthropic/claude-sonnet-4-6 --api-key sk-...
```

`ts-ai` also loads a `.env` from the current directory automatically, so dropping
`OPENAI_API_KEY=...` in a project `.env` is enough. Real environment variables
and `--apiKey` always take precedence over `.env`.

## Interactive mode

Run `ts-ai` with no command on a terminal and you get an animated home screen
that asks what you want to do, with a menu (Chat, Image, Video, …). Pick **Chat**
to drop into a live REPL (`/clear` to reset, `/exit` to quit); pick a generation
command to type a prompt and run it inline.

```bash
ts-ai            # animated menu → pick an action
ts-ai chat       # no prompt on a TTY → interactive chat REPL
```

## Commands

| Command | What it does |
| --- | --- |
| `ts-ai chat <prompt>` | Chat / agentic text generation |
| `ts-ai image <prompt>` | Generate an image |
| `ts-ai video <prompt>` | Generate a video (async job; blocks until done) |
| `ts-ai audio <prompt>` | Generate audio (music / sfx) |
| `ts-ai speech <text>` | Text-to-speech (alias: `tts`) |
| `ts-ai transcribe <file>` | Speech-to-text (alias: `stt`) |
| `ts-ai summarize <text>` | Summarize text |
| `ts-ai introspect` | Print the machine-readable CLI manifest |
| `ts-ai mcp` | Expose every command as an MCP tool over stdio |
| `ts-ai update` | Update `ts-ai` to the latest version |

The prompt is everything after the command that isn't a flag, so multi-word and
multi-line prompts work without quoting gymnastics. When no prompt is given,
input is read from stdin — handy for pipes:

```bash
cat article.txt | ts-ai summarize --model openai/gpt-5.5
```

Attach files with the repeatable `--attachment` flag:

```bash
ts-ai chat "What's in this diagram?" --model openai/gpt-5.5 --attachment diagram.png
```

## Output: humans vs harnesses

`ts-ai` decides how to render based on whether stdout is an interactive TTY:

- **On a TTY** it renders a pretty, [Ink](https://github.com/vadimdemedes/ink)-based
  view: streamed chat text, inline image previews, and saved-file callouts.
- **In `--json` mode, or when stdout is piped/redirected**, it never renders
  anything human-facing. stdout carries only the payload; all progress, warnings,
  and logs go to stderr.

### Buffered JSON

`--json` returns a single JSON object you can parse directly:

```bash
ts-ai image "a red bicycle" --model openai/gpt-image-1 --json
# {"id":"...","model":"gpt-image-1","images":[{"path":"./ts-ai-image-<ts>.png","mimeType":"image/png"}],"usage":{...}}
```

Media commands always write the artifact to a file (override with `-o`, or
`-o -` to stream raw bytes to stdout) and report the path in the JSON.

### Streaming the AG-UI event stream

`--stream` emits the TanStack AI / AG-UI event stream as newline-delimited JSON,
one event per line, so a harness can reconstruct state incrementally:

```bash
ts-ai chat "Write a haiku" --model openai/gpt-5.5 --stream
```

## Stateless multi-turn

`chat` keeps no state of its own. Pass the full conversation in with `--messages`
(a JSON array) and thread the returned messages back yourself:

```bash
ts-ai chat --model openai/gpt-5.5 --json \
  --messages '[{"role":"user","content":"hi"},{"role":"assistant","content":"hello!"},{"role":"user","content":"what did I just say?"}]'
```

`--threadId` is accepted purely as a correlation id (for telemetry / AG-UI) and
never causes anything to be persisted.

## Structured output

Constrain `chat` to a JSON Schema and get a validated object back under `.data`:

```bash
ts-ai chat "Classify: 'the app crashes on launch'" \
  --model openai/gpt-5.5 \
  --schema ./ticket.schema.json \
  --json
# {"data":{"severity":"high","area":"startup"},"model":"gpt-5.5"}
```

## Configuration

Every option is settable as a flag. For nested, provider-specific options use
`--config`, which accepts a JSON file path **or** an inline JSON string whose
shape mirrors the command's options. Precedence is **flags > `--config` > env >
defaults**:

```bash
ts-ai image "a logo" --model openai/gpt-image-1 \
  --config '{"size":"1024x1024","modelOptions":{"background":"transparent"}}'
```

Provider-specific options live only under `modelOptions`.

## Using ts-ai inside an agent harness

Two patterns make `ts-ai` easy to drive programmatically:

1. **`ts-ai introspect`** prints a versioned JSON manifest of every command,
   flag, type, and exit code — read it once and auto-generate tool definitions.
2. **`ts-ai mcp`** starts an MCP server (stdio) that exposes each command as a
   tool, so any MCP-capable agent can register `ts-ai` directly.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Generic runtime error |
| `2` | Usage / validation error |
| `3` | Provider/API error or output-schema validation failure |
| `4` | Required provider package not installed |

In `--json` mode a non-zero exit also prints a structured error object on stdout
so the failure stays parseable:

```json
{ "error": { "code": "USAGE", "message": "Missing --model (e.g. openai/gpt-5.5).", "provider": "openai" } }
```
