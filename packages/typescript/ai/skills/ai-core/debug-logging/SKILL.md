---
name: ai-core/debug-logging
description: >
  Pluggable, category-toggleable debug logging for TanStack AI activities.
  Toggle with `debug: true | false | DebugConfig` on chat(), summarize(),
  generateImage(), generateSpeech(), generateTranscription(), generateVideo().
  Categories: request, provider, output, middleware, tools, agentLoop,
  config, errors. Pipe into pino/winston/etc via `debug: { logger }`. Errors
  log by default even when `debug` is omitted; silence with `debug: false`.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/advanced/debug-logging.md'
---

# Debug Logging

> **Dependency note:** This skill builds on ai-core. Read it first for critical rules.

Use this skill when you need to turn debug logging on or off, narrow what's
printed, or pipe logs into a custom logger (pino, winston, etc.). The same
`debug` option works on every activity — `chat()`, `summarize()`,
`generateImage()`, `generateSpeech()`, `generateTranscription()`,
`generateVideo()`.

## Turn it on

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  debug: true, // all categories on, prints to console
})
```

Each log line is prefixed with an emoji and `[tanstack-ai:<category>]`:

```
📤 [tanstack-ai:request] 📤 activity=chat provider=openai model=gpt-5.2 messages=1 tools=0 stream=true
🔁 [tanstack-ai:agentLoop] 🔁 run started
📥 [tanstack-ai:provider] 📥 provider=openai type=response.output_text.delta
📨 [tanstack-ai:output] 📨 type=TEXT_MESSAGE_CONTENT
```

## Turn it off

```typescript
chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  debug: false, // silence everything, including errors
})
```

Omitting `debug` is **not** the same as `debug: false`. When omitted, the
`errors` category is still on (errors are cheap and important). Use
`debug: false` or `debug: { errors: false }` for true silence.

## `DebugOption` — the accepted shapes

```typescript
type DebugOption = boolean | DebugConfig

interface DebugConfig {
  // Per-category flags. Any flag omitted from a DebugConfig defaults to true.
  request?: boolean
  provider?: boolean
  output?: boolean
  middleware?: boolean
  tools?: boolean
  agentLoop?: boolean
  config?: boolean
  errors?: boolean
  // Optional custom logger. Defaults to ConsoleLogger.
  logger?: Logger
}
```

Resolution rules for the `debug?: DebugOption` field on every activity:

| `debug` value         | Effect                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| omitted (`undefined`) | Only `errors` is active; default `ConsoleLogger`.                            |
| `true`                | All categories on; default `ConsoleLogger`.                                  |
| `false`               | All categories off (including `errors`); default `ConsoleLogger`.            |
| `DebugConfig` object  | Each unspecified flag defaults to `true`; `logger` replaces `ConsoleLogger`. |

## Narrow what's printed

Pass a `DebugConfig` object. Unspecified categories default to `true`, so it's
easiest to toggle by setting specific flags to `false`:

```typescript
chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  debug: { middleware: false }, // everything except middleware
})
```

To print only a specific set, set the rest to `false` explicitly:

```typescript
chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  debug: {
    provider: true,
    output: true,
    middleware: false,
    tools: false,
    agentLoop: false,
    config: false,
    errors: true, // keep errors on — they're cheap and important
    request: false,
  },
})
```

## Pipe into your own logger

```typescript
import type { Logger } from '@tanstack/ai'
import pino from 'pino'

const pinoLogger = pino()
const logger: Logger = {
  debug: (msg, meta) => pinoLogger.debug(meta, msg),
  info: (msg, meta) => pinoLogger.info(meta, msg),
  warn: (msg, meta) => pinoLogger.warn(meta, msg),
  error: (msg, meta) => pinoLogger.error(meta, msg),
}

chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  debug: { logger }, // all categories on, piped to pino
})
```

The default console logger is exported as `ConsoleLogger` if you want to wrap
it:

```typescript
import { ConsoleLogger } from '@tanstack/ai'
```

## Categories

| Category     | Logs                                                           | Applies to                            |
| ------------ | -------------------------------------------------------------- | ------------------------------------- |
| `request`    | Outgoing call to a provider (model, message count, tool count) | All activities                        |
| `provider`   | Every raw chunk/frame received from a provider SDK             | Streaming activities (chat, realtime) |
| `output`     | Every chunk or result yielded to the caller                    | All activities                        |
| `middleware` | Inputs and outputs around every middleware hook                | `chat()` only                         |
| `tools`      | Before/after tool call execution                               | `chat()` only                         |
| `agentLoop`  | Agent-loop iterations and phase transitions                    | `chat()` only                         |
| `config`     | Config transforms returned by middleware `onConfig` hooks      | `chat()` only                         |
| `errors`     | Every caught error anywhere in the pipeline                    | All activities                        |

Chat-only categories simply never fire for non-chat activities — those
concepts don't exist in their pipelines.

## Non-chat activities

Same `debug` option everywhere:

```typescript
summarize({ adapter, text, debug: true })
generateImage({ adapter, prompt: 'a cat', debug: { logger } })
generateSpeech({ adapter, text, debug: { request: true } })
generateTranscription({ adapter, audio, debug: false })
generateVideo({ adapter, prompt: 'a wave', debug: { output: true } })
```

Realtime session adapters in provider packages (e.g. `openaiRealtime`,
`elevenlabsRealtime`) accept the same `debug?: DebugOption` on their session
options. They emit `request`, `provider`, and `errors` lines; the chat-only
categories don't apply.

## Common Mistakes

### a. HIGH: Treating omitted `debug` as silent

```typescript
// WRONG — expecting this to be completely silent
chat({ adapter, messages })
// Errors still print via [tanstack-ai:errors] ... on failure.

// CORRECT — explicit silence
chat({ adapter, messages, debug: false })
chat({ adapter, messages, debug: { errors: false } })
```

`debug` undefined means "only errors"; `debug: false` means "nothing at all".

Source: docs/advanced/debug-logging.md

### b. MEDIUM: Reaching for middleware when `debug` would do

```typescript
// WRONG — writing logging middleware to see chunks flow
const chunkLogger: ChatMiddleware = {
  name: 'chunk-logger',
  onChunk: (ctx, chunk) => {
    console.log(chunk.type, chunk)
  },
}
chat({ adapter, messages, middleware: [chunkLogger] })

// CORRECT — just turn on the relevant categories
chat({
  adapter,
  messages,
  debug: { provider: true, output: true },
})
```

For observing the built-in pipeline, the `debug` option is strictly faster
than writing logging middleware. Reach for middleware when you need to
_transform_ chunks, not just see them.

Source: docs/advanced/debug-logging.md

### c. LOW: Logger implementation that can throw

A user-supplied `Logger` that throws will have its exception swallowed by the
SDK so it never masks the real error that triggered the log call. Still,
prefer implementations that don't throw — silenced exceptions are harder to
debug than loud ones.

```typescript
// WRONG — a logger that can throw on serialization
const fragile: Logger = {
  debug: (msg, meta) => console.debug(msg, JSON.stringify(meta)), // cyclic meta → throws
  /* ... */
}

// CORRECT — guard serialization in the logger itself
const safe: Logger = {
  debug: (msg, meta) => {
    try {
      console.debug(msg, meta)
    } catch {
      console.debug(msg)
    }
  },
  /* ... */
}
```

Source: packages/typescript/ai/src/logger/internal-logger.ts

## Cross-References

- See also: **ai-core/middleware/SKILL.md** — if you need to transform
  chunks/config, not just observe them.
- See also: **Observability** (`docs/advanced/observability.md`) — the
  programmatic event client for a richer, structured feed beyond log lines.
