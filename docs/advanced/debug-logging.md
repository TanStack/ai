---
title: Debug Logging
id: debug-logging
order: 3
description: "Toggle structured debug logs for chunks, middleware, tools, and provider frames in TanStack AI."
keywords:
  - tanstack ai
  - debug
  - logging
  - logger
  - pino
  - troubleshooting
  - chunks
  - middleware debugging
---

If a `chat()` misbehaves → set `debug: true` (or a category map) and inspect the stream.

## Turn it on

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Hello" }],
  debug: true,
});
```

Console prefix: `[tanstack-ai:<category>]`

```
[tanstack-ai:request] activity=chat provider=openai model=gpt-5.5 messages=1 tools=0 stream=true
[tanstack-ai:agentLoop] run started
[tanstack-ai:provider] provider=openai type=response.output_text.delta
[tanstack-ai:output] type=TEXT_MESSAGE_CONTENT
```

## Narrow categories

Omit a flag → it defaults to `true`. Turn off what you don't need:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Hello" }],
  debug: { middleware: false },
});
```

Only specific categories — set the rest to `false`. Keep `errors` on unless you want silence:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Hello" }],
  debug: {
    provider: true,
    output: true,
    middleware: false,
    tools: false,
    agentLoop: false,
    config: false,
    errors: true,
    request: false,
  },
});
```

## Pipe to your logger

```typescript
import { chat, type Logger } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import pino from "pino";
import { messages } from "./server";

const pinoLogger = pino();
const logger: Logger = {
  debug: (msg, meta) => pinoLogger.debug(meta, msg),
  info: (msg, meta) => pinoLogger.info(meta, msg),
  warn: (msg, meta) => pinoLogger.warn(meta, msg),
  error: (msg, meta) => pinoLogger.error(meta, msg),
};

chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  debug: { logger },
});
```

Default export: `ConsoleLogger` from `@tanstack/ai`.

### Logger failures are swallowed

Your `Logger` runs in try/catch so a broken logger never masks the real pipeline error. To notice logger failures, guard inside your implementation:

```typescript
import { type Logger } from "@tanstack/ai";
import pino from "pino";

const pinoLogger = pino();
const logger: Logger = {
  debug: (msg, meta) => {
    try {
      pinoLogger.debug(meta, msg);
    } catch (err) {
      process.stderr.write(`logger failed: ${String(err)}\n`);
    }
  },
  info: (msg, meta) => pinoLogger.info(meta, msg),
  warn: (msg, meta) => pinoLogger.warn(meta, msg),
  error: (msg, meta) => pinoLogger.error(meta, msg),
};
```

## Categories

| Category | Logs | Scope |
|----------|------|-------|
| `request` | Outgoing call (model, message/tool counts) | All activities |
| `provider` | Raw SDK chunks/frames | Streaming (`chat`, `realtime`, streaming media) |
| `output` | Chunks/results to the caller | All activities |
| `middleware` | Hook in/out | `chat()` only |
| `tools` | Before/after tool execution | `chat()` only |
| `agentLoop` | Iterations and phase transitions | `chat()` only |
| `config` | `onConfig` transforms | `chat()` only |
| `errors` | Caught pipeline errors | All activities |

## Errors without debug

Errors still log when you omit `debug`:

```typescript
import { chat } from "@tanstack/ai";
import { adapter } from "./server";

chat({ adapter, messages: [{ role: "user", content: "Hello" }] });
// still prints [tanstack-ai:errors] on failure
```

Silence everything (including errors): `debug: false` or `debug: { errors: false }`. Errors also surface via thrown exceptions / `RUN_ERROR` chunks — the logger is additive.

## Non-chat activities

Same `debug` option:

```typescript
import {
  summarize,
  generateImage,
  generateSpeech,
  generateAudio,
  generateTranscription,
} from "@tanstack/ai";
import { adapter } from "./server";
import { logger } from "./logger";

const text = "Long article to summarize...";
const audio = new File([""], "recording.mp3", { type: "audio/mpeg" });

summarize({ adapter, text, debug: true });
generateImage({ adapter, prompt: "a cat", debug: { logger } });
generateSpeech({ adapter, text, debug: { request: true } });
generateAudio({ adapter, prompt: "ambient piano", debug: true });
generateTranscription({ adapter, audio, debug: { provider: true } });
```

Streaming media: `provider` = raw SDK frames, `output` = AG-UI-shaped chunks. Chat-only categories never fire.

## Related

Middleware inspection: `debug: { middleware: true }` beats a hand-rolled logger. See [Middleware](./middleware).
