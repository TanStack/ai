---
title: Debug Logging
id: debug-logging
order: 3
description: "Turn on structured, category-toggleable debug logging to see every chunk, middleware transform, and tool call inside TanStack AI."
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

# Debug Logging

You have a `chat()` that isn't behaving as expected — a missing chunk, a middleware that doesn't seem to fire, a tool call with wrong args. By the end of this guide, you'll have turned on debug logging and will see every chunk, middleware transform, and tool call flowing through your call.

## Turn it on

Add `debug: true` to any activity call:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "Hello" }],
  debug: true,
});
```

Every internal event now prints to the console with a `[tanstack-ai:<category>]` prefix:

```
[tanstack-ai:request] activity=chat provider=openai model=gpt-4o messages=1 tools=0 stream=true
[tanstack-ai:agentLoop] run started
[tanstack-ai:provider] provider=openai type=response.output_text.delta
[tanstack-ai:output] type=TEXT_MESSAGE_CONTENT
...
```

## Narrow what's printed

Pass a `DebugConfig` object instead of `true`. Every unspecified category defaults to `true`, so toggle by setting specific flags to `false`:

```typescript
chat({
  adapter: openaiText("gpt-4o"),
  messages,
  debug: { middleware: false }, // everything except middleware
});
```

If you want to see ONLY a specific set of categories, set the rest to `false` explicitly. Errors default to `true` — keep them on unless you really want total silence:

```typescript
chat({
  adapter: openaiText("gpt-4o"),
  messages,
  debug: {
    provider: true,
    output: true,
    middleware: false,
    tools: false,
    agentLoop: false,
    config: false,
    errors: true,         // keep errors on — they're cheap and important
    request: false,
  },
});
```

## Pipe into your own logger

Pass a `Logger` implementation and all debug output flows through it instead of `console`:

```typescript
import type { Logger } from "@tanstack/ai";
import pino from "pino";

const pinoLogger = pino();
const logger: Logger = {
  debug: (msg, meta) => pinoLogger.debug(meta, msg),
  info:  (msg, meta) => pinoLogger.info(meta, msg),
  warn:  (msg, meta) => pinoLogger.warn(meta, msg),
  error: (msg, meta) => pinoLogger.error(meta, msg),
};

chat({
  adapter: openaiText("gpt-4o"),
  messages,
  debug: { logger }, // all categories on, piped to pino
});
```

The default logger is exported as `ConsoleLogger` if you want to wrap it:

```typescript
import { ConsoleLogger } from "@tanstack/ai";
```

### Your `Logger` is wrapped in a try/catch

If your `Logger` implementation throws — a cyclic-meta `JSON.stringify`, a transport that rejects synchronously, a typo in a bound `this` — the exception is swallowed so it never masks the real error that triggered the log call (for example, a provider SDK failure inside the chat stream). You won't see the log line, but the pipeline error still surfaces through thrown exceptions and `RUN_ERROR` chunks.

If you need to know when your own logger is failing, guard inside your implementation:

```typescript
const logger: Logger = {
  debug: (msg, meta) => {
    try {
      pinoLogger.debug(meta, msg);
    } catch (err) {
      // surface to wherever you track infra errors
      process.stderr.write(`logger failed: ${String(err)}\n`);
    }
  },
  // ... info, warn, error
};
```

## Categories reference

| Category | Logs | Applies to |
|----------|------|------------|
| `request` | Outgoing call to a provider (model, message count, tool count) | All activities |
| `provider` | Every raw chunk/frame received from a provider SDK | Streaming activities (chat, realtime) |
| `output` | Every chunk or result yielded to the caller | All activities |
| `middleware` | Inputs and outputs around every middleware hook | `chat()` only |
| `tools` | Before/after tool call execution | `chat()` only |
| `agentLoop` | Agent-loop iterations and phase transitions | `chat()` only |
| `config` | Config transforms returned by middleware `onConfig` hooks | `chat()` only |
| `errors` | Every caught error anywhere in the pipeline | All activities |

## Errors are always logged

Errors flow through the logger unconditionally — even when you omit `debug`:

```typescript
chat({ adapter, messages }); // still prints [tanstack-ai:errors] ... on failure
```

To fully silence (including errors), set `debug: false` or `debug: { errors: false }`. Errors also always reach the caller via thrown exceptions or `RUN_ERROR` stream chunks — the logger is additive, not the only surface.

## Non-chat activities

The same `debug` option works on every activity:

```typescript
summarize({ adapter, text, debug: true });
generateImage({ adapter, prompt: "a cat", debug: { logger } });
generateSpeech({ adapter, text, debug: { request: true } });
```

The chat-only categories (`middleware`, `tools`, `agentLoop`, `config`) simply never fire for these activities because those concepts don't exist in their pipelines.

## Related

If you're building middleware and want to see chunks flow through it, `debug: { middleware: true }` is faster than writing a logging middleware. See [Middleware](./middleware) for writing your own middleware, or [Observability](./observability) for the programmatic event client.
