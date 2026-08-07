---
title: "@tanstack/ai"
id: tanstack-ai-api
order: 1
description: "Core API: chat(), toolDefinition(), summarize(), SSE helpers, agent strategies."
keywords:
  - tanstack ai
  - "@tanstack/ai"
  - api reference
  - chat
  - toolDefinition
  - generateImage
  - core library
---

If you need server-side chat, tools, or SSE responses → install and call the APIs below.

```bash
npm install @tanstack/ai
```

## `chat(options)`

Stream (or await) a chat completion.

```typescript
import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { myTool } from "./tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
  tools: [myTool],
  systemPrompts: ["You are a helpful assistant"],
  agentLoopStrategy: maxIterations(20),
});
```

### Required

- `adapter` — adapter + model (e.g. `openaiText('gpt-5.2')`, `anthropicText('claude-sonnet-4-5')`)
- `messages` — `UIMessage | ModelMessage[]` (mixed OK; converts AG-UI fan-out, drops `reasoning`/`activity`, maps `developer` → `system`)

### Common options

- `tools?` — server/client tools for function calling
- `context?` — typed runtime context for tools/middleware (required if those declare a concrete type)
- `systemPrompts?` — prepended system prompts
- `agentLoopStrategy?` — model-turn limit (default `maxIterations(5)`). Turns ≠ tool calls; use middleware for tool budgets ([recipe](../chat/agentic-cycle#tool-call-budgets-middleware-recipe))
- `middleware?` — chat middleware (`onShouldContinue`, `onBeforeToolCall`, …)

### More options

- `modelOptions?` — sampling & provider limits (`temperature`, `top_p`/`topP`, `max_tokens`, …) under provider names. See [modelOptions migration](../migration/sampling-options-to-model-options)
- `abortController?` — cancel the run
- `threadId?` / `runId?` / `parentRunId?` — AG-UI run correlation (`runId` auto-generated if omitted)

**Returns:** async iterable of `StreamChunk`. With `stream: false`, a one-shot result; with `outputSchema`, a parsed structured result.

---

## `toolDefinition(config)`

Define once; attach `.server()` or `.client()` implementations.

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const myToolDef = toolDefinition({
  name: "my_tool",
  description: "Tool description",
  inputSchema: z.object({ param: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  needsApproval: false,
});

const myServerTool = myToolDef.server(async ({ param }) => {
  return { result: "..." };
});

const myClientTool = myToolDef.client(async ({ param }) => {
  return { result: "..." };
});

chat({
  adapter: openaiText("gpt-5.2"),
  tools: [myServerTool],
  messages: [{ role: "user", content: "..." }],
});
```

### Typed context for server tools

```typescript
import { chat, toolDefinition, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { session, db } from "./app";

type AppContext = {
  userId: string;
  db: { users: { findName(id: string): Promise<string> } };
};

const currentUser = toolDefinition({
  name: "current_user",
  description: "Get the current user",
}).server<AppContext>(async (_input: unknown, ctx) => {
  return { name: await ctx.context.db.users.findName(ctx.context.userId) };
});

export async function POST(request: Request) {
  const { messages } = await request.json();
  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    messages,
    tools: [currentUser],
    context: { userId: session.user.id, db },
  });
  return toServerSentEventsResponse(stream);
}
```

### Config

- `name` — unique tool name
- `description` — for the model
- `inputSchema` — Zod (or schema) for inputs
- `outputSchema?` — Zod for outputs
- `needsApproval?` / `metadata?` — approval gate and extra metadata

**Returns:** `ToolDefinition` with `.server()` / `.client()`.

---

## `summarize(options)`

```typescript
import { summarize } from "@tanstack/ai";
import { openaiSummarize } from "@tanstack/ai-openai";

const result = await summarize({
  adapter: openaiSummarize("gpt-5.2"),
  text: "Long text to summarize...",
  maxLength: 100,
  style: "concise",
});
```

- `adapter` — summarize adapter + model
- `text` — source text
- `maxLength?` / `style?` — `"concise" | "detailed"`
- `modelOptions?` — model-specific options

**Returns:** `SummarizationResult`.

---

## SSE / HTTP helpers

### `toServerSentEventsStream(stream, abortController?)`

```typescript
import { chat, toServerSentEventsStream } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
});
const readableStream = toServerSentEventsStream(stream);
```

SSE format: `data: …\n\n`, ends with `data: [DONE]\n\n`.

### `toServerSentEventsResponse(stream, init?)`

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

async function POST() {
  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    messages: [{ role: "user", content: "Hello!" }],
  });
  return toServerSentEventsResponse(stream);
}
```

Sets SSE headers (`Content-Type: text/event-stream`, etc.). `init?` may include `abortController`.

---

## Request parsing

### `chatParamsFromRequest(req)`

Parse + validate AG-UI `RunAgentInput` from a `Request`. Malformed body → throws a **400 `Response`** (auto-handled by TanStack Start, SolidStart, Remix, React Router 7).

```typescript
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { serverTools } from "./tools";

export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req);
  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages: params.messages,
    tools: serverTools,
  });
  return toServerSentEventsResponse(stream);
}
```

**Returns:** `{ messages, threadId, runId, parentRunId?, tools, forwardedProps, state, aguiContext, context }`.

- Prefer `aguiContext` (AG-UI protocol context). Map it yourself into `chat({ context })` if tools need it.
- `context` is a deprecated alias of `aguiContext`.

> **Next.js / SvelteKit / Hono / Node:** no auto-throw handling. Use try/catch or `chatParamsFromRequestBody(await req.json())`.

### `chatParamsFromRequestBody(body)`

Same validation on an already-parsed body. Rejects with `AGUIError`.

```typescript
import { chatParamsFromRequestBody } from "@tanstack/ai";

async function handler(req: Request): Promise<Response> {
  const body = await req.json();
  try {
    const params = await chatParamsFromRequestBody(body);
    // ...
    return new Response("ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(message, { status: 400 });
  }
}
```

### `mergeAgentTools(serverTools, clientTools)`

Server tools win on name collision. Client-only tools become no-execute stubs (`ClientToolRequest` events).

```typescript
import { chat, chatParamsFromRequest, mergeAgentTools } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { serverTools } from "./tools";

async function handler(req: Request) {
  const params = await chatParamsFromRequest(req);
  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages: params.messages,
    tools: mergeAgentTools(serverTools, params.tools),
  });
}
```

---

## `maxIterations(count)`

Limit **model turns**, not tool calls. One turn can still fire many parallel tools — use middleware for tool budgets ([recipe](../chat/agentic-cycle#tool-call-budgets-middleware-recipe)).

```typescript
import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
  agentLoopStrategy: maxIterations(20),
});
```

---

## Types (brief)

### `ModelMessage`

```typescript
interface ModelMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
}
```

### `StreamChunk`

```typescript ignore
type StreamChunk =
  | ContentStreamChunk
  | ThinkingStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk;
```

Chunk kinds: content, thinking (reasoning models), tool call, tool result, done, error.

### `Tool` / `ToolExecutionContext`

```typescript
import type { SchemaInput, ToolExecutionContext } from "@tanstack/ai";

interface Tool<TContext = unknown> {
  name: string;
  description: string;
  inputSchema?: SchemaInput;
  outputSchema?: SchemaInput;
  execute?: (
    args: any,
    context?: ToolExecutionContext<TContext>
  ) => Promise<any> | any;
  needsApproval?: boolean;
  lazy?: boolean;
  metadata?: Record<string, any>;
}
```

`context` comes from `chat({ context })` (server) or client options (client). Required when `TContext` is concrete.

### `ChatMiddleware`

Hooks: `onStart`, `onChunk`, `onBeforeToolCall`, `onAfterToolCall`, `onFinish`, `onAbort`, `onError`. See [Runtime Context](../advanced/runtime-context).

---

## Patterns

```typescript
import { chat, summarize, generateImage, toolDefinition } from "@tanstack/ai";
import {
  openaiText,
  openaiSummarize,
  openaiImage,
} from "@tanstack/ai-openai";
import { z } from "zod";

const weatherTool = toolDefinition({
  name: "getWeather",
  description: "Get the current weather for a city",
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => {
  return JSON.stringify({ temperature: 72, condition: "Sunny" });
});

async function examples() {
  // One-shot (no stream)
  const response = await chat({
    adapter: openaiText("gpt-5.2"),
    messages: [{ role: "user", content: "What's the capital of France?" }],
    stream: false,
  });

  // Structured output
  const parsed = await chat({
    adapter: openaiText("gpt-5.2"),
    messages: [
      {
        role: "user",
        content:
          "Summarize this text in JSON with keys 'summary' and 'keywords': ... ",
      },
    ],
    outputSchema: z.object({
      summary: z.string(),
      keywords: z.array(z.string()),
    }),
  });

  // Tools + structured output
  await chat({
    adapter: openaiText("gpt-5.2"),
    messages: [{ role: "user", content: "What's the weather in Paris?" }],
    tools: [weatherTool],
    outputSchema: z.object({
      answer: z.string(),
      weather: z.object({
        temperature: z.number(),
        condition: z.string(),
      }),
    }),
  });

  await summarize({
    adapter: openaiSummarize("gpt-5.2"),
    text: "Long text to summarize...",
    maxLength: 100,
  });

  await generateImage({
    adapter: openaiImage("dall-e-3"),
    prompt: "A futuristic city skyline at sunset",
    numberOfImages: 1,
    size: "1024x1024",
  });
}
```

## Next Steps

- [Getting Started](../getting-started/quick-start)
- [Tools Guide](../tools/tools)
- [Adapters](../adapters/openai)
