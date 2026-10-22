---
title: Debug Logging
id: debug-logging
order: 3
description: "Turn on debug logging to see each chunk, middleware transform, and tool call inside TanStack AI. Pick the categories you want, or send the output to your own logger."
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

Debug logging prints each chunk, middleware step, and tool argument from `chat()`. Turn it on when a run does not match what you expect.

Turn on debug logging. You then see each chunk, middleware transform, and tool call in your console.

## Quick setup

Add `debug: true` to the call:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello" }],
  threadId: "thread-1",
  debug: true,
});
```

Run it. Each internal event prints to the console with a `[tanstack-ai:<category>]` prefix:

```
[tanstack-ai:request] activity=chat provider=openai model=gpt-6.1-sol messages=1 tools=0 stream=true
[tanstack-ai:agentLoop] run started
[tanstack-ai:provider] provider=openai type=response.output_text.delta
[tanstack-ai:output] type=TEXT_MESSAGE_CONTENT
```

## Print less

Pass an object in place of `true`. Each category that you do not name stays on. Set a category to `false` to turn it off:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello" }],
  threadId: "thread-1",
  debug: { middleware: false }, // everything except middleware
});
```

To see only some categories, set all the others to `false`. Keep `errors` on. Error logs are cheap and you need them.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello" }],
  threadId: "thread-1",
  debug: {
    provider: true,
    output: true,
    middleware: false,
    tools: false,
    agentLoop: false,
    config: false,
    errors: true,
    request: false,
    sandbox: false,
  },
});
```

## Send logs to your own logger

Pass a `Logger` as `logger`. All debug output then goes to it, not to `console`:

```typescript
import { chat, type Logger } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import pino from "pino";

const pinoLogger = pino();
const logger: Logger = {
  debug: (msg, meta) => pinoLogger.debug(meta, msg),
  info: (msg, meta) => pinoLogger.info(meta, msg),
  warn: (msg, meta) => pinoLogger.warn(meta, msg),
  error: (msg, meta) => pinoLogger.error(meta, msg),
};

chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello" }],
  threadId: "thread-1",
  debug: { logger }, // all categories on, sent to pino
});
```

The default logger is `ConsoleLogger`. You can import it to wrap it:

```typescript
import { ConsoleLogger } from "@tanstack/ai";
```

## Categories

| Category | Logs | Applies to |
|----------|------|------------|
| `request` | The outgoing call to a provider (model, message count, tool count) | All activities |
| `provider` | Each raw chunk or frame from a provider SDK | Streaming activities (`chat`, `realtime`, and streaming `generateAudio`, `generateSpeech`, `generateTranscription`) |
| `output` | Each chunk or result that goes to the caller | All activities |
| `middleware` | Inputs and outputs around each middleware hook | `chat()` only |
| `tools` | Before and after each tool call | `chat()` only |
| `agentLoop` | Agent-loop iterations and phase changes | `chat()` only |
| `config` | Config changes that middleware `onConfig` hooks return | `chat()` only |
| `errors` | Each caught error in the pipeline | All activities |
| `sandbox` | Sandbox internals: watcher start and stop, file events, sandbox hooks, and lifecycle changes | `chat()` only |

Building a middleware? `debug: { middleware: true }` shows the chunks that go through it, with no logging middleware of your own. See [Middleware](./middleware) to write one.

## Advanced

### Errors are always logged

The logger gets errors even when you leave out `debug`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

// On a failure, this still prints [tanstack-ai:errors] ...
chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello" }],
  threadId: "thread-1",
});
```

To turn off all output, errors included, set `debug: false` or `debug: { errors: false }`.

The logger is an extra output. Errors also always reach the caller, as thrown exceptions or `RUN_ERROR` stream chunks.

### A failing logger does not break the call

The library calls your `Logger` inside a try/catch. If your logger throws, the library drops the exception. Examples are a `JSON.stringify` on a cyclic `meta`, a transport that rejects synchronously, or a wrong `this` binding.

This way, a logger failure never hides the real error that caused the log call, for example a provider SDK failure in the chat stream. You do not see the log line. The pipeline error still reaches you through thrown exceptions and `RUN_ERROR` chunks.

To know when your own logger fails, add a guard in your implementation:

```typescript
import { type Logger } from "@tanstack/ai";
import pino from "pino";

const pinoLogger = pino();
const logger: Logger = {
  debug: (msg, meta) => {
    try {
      pinoLogger.debug(meta, msg);
    } catch (err) {
      // Send it to the place where you track infrastructure errors.
      process.stderr.write(`logger failed: ${String(err)}\n`);
    }
  },
  info: (msg, meta) => pinoLogger.info(meta, msg),
  warn: (msg, meta) => pinoLogger.warn(meta, msg),
  error: (msg, meta) => pinoLogger.error(meta, msg),
};
```

### Other activities

The same `debug` option works on each activity:

```typescript
import {
  summarize,
  generateImage,
  generateSpeech,
  generateAudio,
  generateTranscription,
  type Logger,
} from "@tanstack/ai";
import { adapter } from "./server";
import { logger } from "./logger";

const threadId = "thread-1";
const text = "Long article to summarize...";
const audio = new File([""], "recording.mp3", { type: "audio/mpeg" });

summarize({ adapter, text, debug: true, threadId });
generateImage({ adapter, prompt: "a cat", debug: { logger }, threadId });
generateSpeech({ adapter, text, debug: { request: true }, threadId });
generateAudio({ adapter, prompt: "ambient piano", debug: true, threadId });
generateTranscription({ adapter, audio, debug: { provider: true }, threadId });
```

When you stream `generateAudio`, `generateSpeech`, or `generateTranscription` (`stream: true`):

- `provider` shows the raw SDK chunks.
- `output` shows the AG-UI chunks that go to the caller.

If a media pipeline seems stuck, or the bytes are not what you expect, read these two categories.

The chat-only categories (`middleware`, `tools`, `agentLoop`, `config`) never fire for these activities. Those parts do not exist in their pipelines.

For traces and metrics in production, use [OpenTelemetry](./otel).
