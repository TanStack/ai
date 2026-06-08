---
name: ai-cli
description: >
  Drive TanStack AI from the terminal or an agent harness with the `ts-ai`
  binary: chat, image, video, audio, speech, transcribe, summarize, plus
  introspect (machine-readable manifest), mcp (expose commands as MCP tools),
  and update. Machine-first design — `--json` buffered output, `--stream` AG-UI
  events, strict stdout-is-payload, typed exit codes, structured error objects.
  Providers resolve from a `provider/model` slug; options via flags or `--config`;
  generations write to the cwd or `--output-dir`.
type: core
library: tanstack-ai
library_version: '0.1.0'
sources:
  - 'TanStack/ai:docs/cli/overview.md'
  - 'TanStack/ai:packages/ai-cli/src/manifest/manifest.ts'
---

# `@tanstack/ai-cli` (`ts-ai`)

`ts-ai` is a thin, type-safe CLI over the core TanStack AI activities, built so
the **same binary** serves one-off human use and agent harnesses. For
programmatic use, always drive the machine path: pass `--json`, parse stdout,
branch on the exit code.

## Install / invoke

```bash
# zero-install one-off
npx @tanstack/ai-cli image "a watercolor fox" --output-dir ./out

# or globally
pnpm add -g @tanstack/ai-cli
ts-ai --version
```

OpenAI, Anthropic, Gemini, OpenRouter, and Fal are bundled (zero-install). Other
providers (ollama, grok, groq, elevenlabs) are loaded on demand; if one isn't
installed, `ts-ai` exits with code `4` telling you which package to add.

## Model + key

Select a model with a `provider/model` slug. The key comes from `--api-key`, a
conventional `.env` in the working directory, or the provider's env var
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`,
`FAL_KEY`).

```bash
ts-ai chat "Explain MCP in one sentence" --model openai/gpt-5.5 --json
ts-ai chat "Summarize this" --model anthropic/claude-haiku-4-5 --api-key sk-...
```

The model after the first `/` may itself contain slashes (e.g.
`openrouter/openai/gpt-oss-120b`, `fal/fal-ai/ltx-video`).

## The machine-mode contract

This is what makes `ts-ai` safe to script:

- **`--json`** prints a single buffered JSON object to stdout, nothing else.
- **`--stream`** prints the AG-UI event stream as newline-delimited JSON (one
  event per line) for incremental consumption.
- **stdout carries only the payload.** All progress, warnings, and logs go to
  **stderr**. Capture stdout and `JSON.parse` it directly.
- **Exit codes:** `0` success · `1` runtime · `2` usage/validation · `3`
  provider/API or output-schema validation · `4` provider package not installed.
- On any non-zero exit in `--json` mode, a structured error object is printed to
  **stdout**: `{ "error": { "code": "...", "message": "...", "provider": "..." } }`.

```bash
result=$(ts-ai chat "classify: 'app crashes on launch'" \
  --model openai/gpt-5.5 --schema ./ticket.schema.json --json)
echo "$result" | jq '.data'
```

## Commands

| Command                   | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `ts-ai chat <prompt>`     | Chat / agentic text (tools, code-mode, structured output) |
| `ts-ai image <prompt>`    | Generate an image                                         |
| `ts-ai video <prompt>`    | Generate a video (async job; blocks until done)           |
| `ts-ai audio <prompt>`    | Generate audio (music / sfx)                              |
| `ts-ai speech <text>`     | Text-to-speech (alias `tts`)                              |
| `ts-ai transcribe <file>` | Speech-to-text (alias `stt`)                              |
| `ts-ai summarize <text>`  | Summarize text                                            |
| `ts-ai introspect`        | Print the full CLI manifest as JSON                       |
| `ts-ai mcp`               | Expose every command as an MCP tool over stdio            |
| `ts-ai update`            | Update to the latest version                              |

The prompt is every non-flag argument after the command. With no positional
prompt, input is read from stdin (`cat doc.txt | ts-ai summarize ...`). Media
inputs use the repeatable `--attachment <file>` flag (`-` reads stdin).

## chat specifics

`chat` is 100% stateless — pass the full history in and thread the returned
messages back yourself:

```bash
ts-ai chat --model openai/gpt-5.5 --json \
  --messages '[{"role":"user","content":"hi"},{"role":"assistant","content":"hello!"},{"role":"user","content":"what did I say?"}]'
```

- `--system <text|file>` — system prompt.
- `--max-steps <n>` — bound the agent loop (tool-calling iterations).
- `--mcp <cmd-or-url>` (repeatable) — give the chat tools from an MCP server. A
  spec is an HTTP(S) URL or a stdio command (`--mcp "npx -y @scope/server /tmp"`).
- `--code-mode` — wrap the MCP tools in a sandboxed `execute_typescript` tool
  (requires at least one `--mcp` server to orchestrate).
- `--schema <file|inline>` — JSON Schema for structured output; the validated
  object is returned under `.data` in the JSON envelope.
- `--thread-id <id>` — passthrough correlation id (telemetry / AG-UI); never
  causes persistence.

On a TTY with no prompt, `ts-ai chat` opens an interactive REPL instead.

## Output of generations

`image`, `video`, `audio`, `speech` always write a file and report the path in
the JSON. Default: the **current directory** with an auto-generated name.

- `--output-dir <dir>` — auto-named file into `<dir>` (created if missing;
  cross-platform).
- `-o/--output <path>` — exact file path (wins over `--output-dir`).
- `-o -` — stream raw bytes to stdout (for piping).

```bash
ts-ai image "a red bicycle" --model openai/gpt-image-1 --output-dir ./assets --json
ts-ai speech "hello there" --model openai/gpt-4o-mini-tts -o ./hi.mp3 --json
ts-ai transcribe ./talk.mp3 --model openai/gpt-4o-mini-transcribe --json
```

## Options & --config

Every option is a flag, but nested, provider-specific options live under
`--config`, which accepts a JSON file path **or** an inline JSON string mirroring
the command's options. Precedence: **flags > `--config` > env > defaults**.

```bash
ts-ai image "a logo" --model openai/gpt-image-1 \
  --config '{"size":"1024x1024","modelOptions":{"background":"transparent"}}'
```

`modelOptions` (the unbounded provider-specific bag) is only settable via
`--config`.

## Self-description for harnesses

- `ts-ai introspect` prints a versioned JSON manifest of every command, flag
  (with its exact CLI spelling), type, default, and exit code — read it once to
  auto-generate tool/function definitions.
- `ts-ai mcp` starts an MCP server (stdio) exposing each command as a tool, so an
  MCP-capable agent can register `ts-ai` directly. On startup it prints a
  ready-to-paste client config to **stderr** (stdout is the JSON-RPC channel).

## Common Mistakes

### CRITICAL: Parsing stdout without `--json`

On a TTY, `ts-ai` renders a pretty Ink UI (colors, image previews, spinners) to
stdout. A harness that scrapes that output gets ANSI/terminal garbage. Always
pass `--json` (or `--stream`) in programmatic use; then stdout is exactly one
JSON object (or one event per line) and nothing else.

Wrong:

```bash
answer=$(ts-ai chat "hi" --model openai/gpt-5.5)   # pretty UI if stdout is a TTY
```

Right:

```bash
answer=$(ts-ai chat "hi" --model openai/gpt-5.5 --json | jq -r '.text')
```

Source: docs/cli/overview.md

### HIGH: Ignoring the exit code / not reading the error envelope

Failures are reported by exit code AND, in `--json` mode, a structured error
object on stdout. Branch on the exit code; on non-zero, parse `.error.code`
(`USAGE`, `PROVIDER`, `PROVIDER_NOT_INSTALLED`, `OUTPUT_VALIDATION`, `RUNTIME`).

```bash
out=$(ts-ai image "x" --model openai/gpt-image-1 --json) || {
  code=$(echo "$out" | jq -r '.error.code')
  echo "ts-ai failed: $code" >&2
  exit 1
}
```

Source: packages/ai-cli/src/core/exit-codes.ts

### HIGH: Passing provider-specific options as flags

Only the bounded, documented options are flags (`--size`, `--voice`, etc.).
Anything provider-specific (reasoning effort, background, moderation, …) must go
under `--config`'s `modelOptions` — there is no generic `--model-options` flag.

Wrong:

```bash
ts-ai image "x" --model openai/gpt-image-1 --background transparent   # unknown flag
```

Right:

```bash
ts-ai image "x" --model openai/gpt-image-1 --config '{"modelOptions":{"background":"transparent"}}'
```

Source: packages/ai-cli/src/manifest/manifest.ts

### MEDIUM: Expecting `ts-ai mcp` to stream, or printing info to stdout

MCP tool calls are request/response — they return the command's buffered `--json`
result, never the AG-UI stream. And `ts-ai mcp`'s human-facing connection info is
written to **stderr** on purpose; stdout is reserved for JSON-RPC. Don't grep the
server's stdout for the config — read stderr (MCP clients surface it in logs).

Source: docs/cli/overview.md

### MEDIUM: Assuming every provider supports every command

Resolution maps `provider/model` + activity to an adapter factory. A provider
that lacks a factory for an activity exits `2` (`USAGE`); a non-bundled provider
that isn't installed exits `4` (`PROVIDER_NOT_INSTALLED`). Only openai,
anthropic, gemini, openrouter, and fal are bundled.

Source: packages/ai-cli/src/core/providers.ts

## Cross-References

- See also: ai-core/SKILL.md — the underlying `chat`/`generateImage`/… activities the CLI wraps.
- See also: ai-mcp/SKILL.md — the MCP client that powers `--mcp`.
- See also: ai-code-mode/SKILL.md — the sandbox behind `--code-mode`.
