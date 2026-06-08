---
'@tanstack/ai-cli': minor
---

Add `@tanstack/ai-cli` — a type-safe CLI over TanStack AI exposing the core
activities as the `ts-ai` binary (`chat`, `image`, `video`, `audio`, `speech`,
`transcribe`, `summarize`), plus `introspect` (machine-readable manifest),
`mcp` (expose commands as MCP tools), and `update`.

Designed machine-first for agent harnesses: every command is a stateless
single-shot subprocess with `--json` buffered output, `--stream` AG-UI event
output, strict stdout-is-payload discipline, typed exit codes, and structured
error objects. Providers resolve from a `provider/model` slug (openai,
anthropic, gemini, openrouter, and fal bundled for zero-install) with keys from
`--apiKey`, a conventional `.env`, or environment variables, and all options are
expressible via `--config` (file or inline JSON).

For humans there's a lazily-loaded, TanStack-branded Ink layer: running `ts-ai`
with no command on a TTY opens a full-width welcome screen (island logo on
graphics-capable terminals + a two-color `TANSTACK` / pink `AI` wordmark) and
menu, `ts-ai chat` with no prompt drops into an interactive REPL, and image
results preview inline. `chat` supports tools via `--mcp` servers, sandboxed
`--code-mode` execution, and `--schema` structured output, plus
`ts-ai introspect` (machine-readable manifest), `ts-ai mcp` (expose commands as
MCP tools — prints a ready-to-paste client config to stderr), and `ts-ai update`.

Generations (`image`, `video`, `audio`, `speech`) write to the current directory
by default; `--output-dir <dir>` sets the target directory (created if missing,
cross-platform) and `-o/--output <path>` sets an exact path.

Ships a TanStack Intent agent skill (`ai-cli`) so coding agents learn how to
drive `ts-ai` correctly (machine-mode contract, exit codes, `--config`,
`--output-dir`, `introspect`, `mcp`).
