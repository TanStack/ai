---
'@tanstack/ai': minor
---

**Pluggable debug logging across every activity.** `chat`, `summarize`, `generateImage`, `generateVideo`, `generateSpeech`, and `generateTranscription` now accept a `debug?: DebugOption` that turns on structured per-category logs (`request`, `provider`, `output`, `middleware`, `tools`, `agentLoop`, `config`, `errors`).

```ts
chat({ adapter, messages, debug: true }) // all categories on
chat({ adapter, messages, debug: false }) // silent (incl. errors)
chat({ adapter, messages, debug: { middleware: false } }) // all except middleware
chat({ adapter, messages, debug: { logger: pino } }) // route to a custom logger
```

Additions:

- New `Logger` interface (`debug` / `info` / `warn` / `error`) and default `ConsoleLogger` that routes to matching `console.*` methods and prints nested `meta` via `console.dir(meta, { depth: null, colors: true })` so streamed provider payloads render in full.
- New `DebugCategories` / `DebugConfig` / `DebugOption` public types.
- New internal `@tanstack/ai/adapter-internals` subpath export exposing `InternalLogger` + `resolveDebugOption` so provider adapters can thread logging without leaking internals on the public surface.
- Each log line is prefixed with an emoji + `[tanstack-ai:<category>]` tag so categories are visually distinguishable in dense streams. Errors log unconditionally unless explicitly silenced.
- `TextEngine`, `MiddlewareRunner`, and every activity entry point thread a resolved `InternalLogger` through the pipeline — no globals, concurrent calls stay independent.
- Exceptions thrown by a user-supplied `Logger` implementation are swallowed so they never mask the real error that triggered the log call.
- New `ai-core/debug-logging` skill shipped under `packages/typescript/ai/skills/` so agents can discover how to toggle, narrow, and redirect debug output.
