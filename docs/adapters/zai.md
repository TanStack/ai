---
title: "Z.AI"
id: zai-adapter
order: 9
description: "Use Z.AI GLM models in TanStack AI with @tanstack/ai-zai: streaming chat, tool calling, web search, reasoning effort, vision, and summarization over the OpenAI-compatible Chat Completions API."
keywords:
  - tanstack ai
  - zai
  - z.ai
  - glm
  - glm-5.3
  - adapter
  - reasoning
  - web search
---

The Z.AI adapter calls the GLM chat models. It uses Z.AI's OpenAI-compatible
Chat Completions endpoint.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-zai
vue: @tanstack/ai-zai
solid: @tanstack/ai-zai
svelte: @tanstack/ai-zai
preact: @tanstack/ai-zai
angular: @tanstack/ai-zai
vanilla: @tanstack/ai-zai
octane: @tanstack/ai-zai

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
ZAI_API_KEY=...
```

`zaiText` reads `ZAI_API_KEY`. To pass the key in code, use `createZAIText`:

```typescript
import { createZAIText } from "@tanstack/ai-zai";

const adapter = createZAIText("glm-5.3", process.env.ZAI_API_KEY!);
```

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { zaiText } from "@tanstack/ai-zai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: zaiText("glm-5.3"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

## 4. Render the chat

The client is the same for every provider. Point `useChat` at your route:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "zai-chat",
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sendMessage(input);
        setInput("");
      }}
    >
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts
            .map((part) => (part.type === "text" ? part.content : ""))
            .join("")}
        </p>
      ))}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
    </form>
  );
}
```

For Vue, Solid, Svelte, Angular, and the other frameworks, see
[Quick Start](../getting-started/quick-start#3-render-the-chat).

You now have a streaming chat on Z.AI. [Tools](../tools/tools) and
[Structured Outputs](../structured-outputs/overview) work the same as with
every adapter. For the Z.AI details, see
[Formats the endpoint rejects](#formats-the-endpoint-rejects).

## Models and options

### Model options

Provider options go in `modelOptions`. The sampling options are `temperature`,
`top_p`, `seed`, `stop`, `frequency_penalty`, `presence_penalty`, and
`max_tokens`:

```typescript
import { chat } from "@tanstack/ai";
import { zaiText } from "@tanstack/ai-zai";

const stream = chat({
  adapter: zaiText("glm-5.3"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  modelOptions: {
    temperature: 0.7,
    max_tokens: 1024,
  },
});
```

Sampling options do not go at the root of `chat()`. See
[Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

Set how hard a reasoning model thinks with `reasoning` on `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { zaiText } from "@tanstack/ai-zai";

const stream = chat({
  adapter: zaiText("glm-5.3"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  reasoning: "high",
});
```

The adapter sends the level as `reasoning_effort`. It clamps a level the model
does not have to the nearest one that it does:

- `glm-5.2`: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.
- `glm-5.3` and `glm-5.3-flash`: `low`, `high`, `max`. A lower level becomes
  `low`.

GLM-4.7 and GLM-4.6 have no `reasoning_effort`. Turn their thinking on with the
provider option instead:

```typescript
import { chat } from "@tanstack/ai";
import { zaiText } from "@tanstack/ai-zai";

const stream = chat({
  adapter: zaiText("glm-4.7"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  modelOptions: { thinking: { type: "enabled", clear_thinking: false } },
});
```

`clear_thinking: false` keeps the reasoning of earlier turns. The thinking text
arrives as `delta.reasoning_content`, and the adapter emits it as AG-UI
reasoning events.

### Structured output

`chat({ outputSchema })` works on every model in the catalog. Z.AI rejects
`response_format: { type: "json_schema" }`, so the adapter sends JSON mode and
adds your schema to the system prompt. It then parses the reply with your
schema. Read
[When strict JSON schema is rejected](../structured-outputs/overview.md#when-strict-json-schema-is-rejected).
Without `stream: true`, `chat()` resolves to the parsed object, so await it:

```typescript
import { chat } from "@tanstack/ai";
import { zaiText } from "@tanstack/ai-zai";
import { z } from "zod";

const orderSchema = z.object({
  status: z.enum(["open", "closed"]),
  total: z.number(),
});

const order = await chat({
  adapter: zaiText("glm-5.3"),
  messages: [{ role: "user", content: "Summarize my open orders" }],
  threadId: "thread-1",
  outputSchema: orderSchema,
});
```

### Tools

Function tools work on every model. Z.AI accepts a `tool_choice` of `auto`
only, so the adapter cannot force a call. With `toolChoice: 'none'` it sends
no tools at all, which gives you the text-only answer you asked for. With
`'required'` or a named tool it warns once and sends `auto`, so the model
decides. See [Choose when the model calls a tool](../tools/tools#choose-when-the-model-calls-a-tool).

Z.AI also runs a search on the provider side. Add it with `zaiWebSearchTool`:

```typescript
import { chat } from "@tanstack/ai";
import { zaiText, zaiWebSearchTool } from "@tanstack/ai-zai";

const stream = chat({
  adapter: zaiText("glm-5.3"),
  messages: [{ role: "user", content: "What is new in TanStack AI?" }],
  threadId: "thread-1",
  tools: [zaiWebSearchTool({ search_result: true })],
});
```

GLM-4.7 and newer can stream tool-call arguments as the model writes them. Set
`tool_stream: true` in `modelOptions`.

### Images and video

The vision models take `image` and `video` content parts:

```typescript
import { chat } from "@tanstack/ai";
import { zaiText } from "@tanstack/ai-zai";

const stream = chat({
  adapter: zaiText("glm-5.3-flash"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "What is in this image?" },
        { type: "image", source: { type: "url", value: "https://example.com/guitar.jpg" } },
      ],
    },
  ],
  threadId: "thread-1",
});
```

Vision models: `glm-5.3-flash`, `glm-5v-turbo`, `glm-4.6v`.
A video source must be an HTTP(S) URL. Z.AI has no base64 video input, so a
`data` source throws before the request.
`adapter.inputModalities` lists the input kinds of the selected model. See
[Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

### Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { zaiSummarize } from "@tanstack/ai-zai";

const result = await summarize({
  adapter: zaiSummarize("glm-5.3"),
  text: "Your long text to summarize...",
  threadId: "thread-1",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

### Coding endpoint

A coding-plan key uses a different host. Pass `coding: true`:

```typescript
import { zaiText } from "@tanstack/ai-zai";

const adapter = zaiText("glm-5.3", { coding: true });
```

That selects `https://api.z.ai/api/coding/paas/v4`. A `baseURL` you set wins.

### BYOK

Import `zaiByok` from `@tanstack/ai-zai/byok` and add it to your store:

```typescript
import { defaultByokStorage, defineByok } from "@tanstack/ai-react/byok";
import { zaiByok } from "@tanstack/ai-zai/byok";

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: [zaiByok],
});
```

Registering `zaiByok` is the Z.AI part. Save the key with
`byok.update("zai", value)` and pass the store to `useChat`, with
`forwardedProps.provider` set to `"zai"` so the send carries that key and
nothing else:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { byok } from "./byok";

export function Chat() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "zai-chat",
    byok,
    forwardedProps: { provider: "zai" },
  });

  return (
    <button type="button" onClick={() => void sendMessage("Hello")}>
      Send
    </button>
  );
}
```

Save a key, build a dialog, and use the server fallback in
[BYOK](../advanced/byok).

On the server, one call reads the key. The `x-byok-zai` header from the browser
wins over `ZAI_API_KEY`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";
import { createZAIText } from "@tanstack/ai-zai";
import { zaiByok } from "@tanstack/ai-zai/byok";

export async function POST(request: Request) {
  const apiKey = getByokKey(request, zaiByok);
  if (!apiKey) return byokMissing(zaiByok);

  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: createZAIText("glm-5.3", apiKey),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

### Model list

The package exports the list as `ZAI_CHAT_MODELS` and the full metadata,
including pricing, as `ZAI_MODEL_META`.

| Group | Models |
| --- | --- |
| GLM-5.3 | `glm-5.3` (reasoning), `glm-5.3-flash` (reasoning, vision) |
| GLM-5 | `glm-5.2` (reasoning), `glm-5.1`, `glm-5-turbo`, `glm-5`, `glm-5v-turbo` (vision) |
| GLM-4 | `glm-4.7`, `glm-4.6`, `glm-4.6v` (vision) |

Every model streams, calls tools, and accepts JSON mode. The largest context
window is 1,000,000 tokens on `glm-5.3`, `glm-5.3-flash`, and `glm-5.2`.

## Advanced

### Formats the endpoint rejects

The adapter hides two endpoint limits, so you do not hit them by hand:

- `response_format` accepts `json_object` but not `json_schema`. Structured
  output uses JSON mode plus a schema system prompt.
- `tool_choice` accepts `auto` only. A named or required choice fails the
  request.

### Configuration

```typescript
import { createZAIText, type ZAITextConfig } from "@tanstack/ai-zai";

const config: Omit<ZAITextConfig, "apiKey"> = {
  baseURL: "https://api.z.ai/api/paas/v4", // Optional, for a custom endpoint
  timeout: 60_000,
  maxRetries: 2,
};

const adapter = createZAIText("glm-5.3", process.env.ZAI_API_KEY!, config);
```

The config extends the OpenAI SDK client options, because the adapter drives
that SDK against the Z.AI base URL. Need a header on each request, or a log of
each model call? This adapter supports
[`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

### API reference

Each factory pair has the same shape. The short factory reads `ZAI_API_KEY`
from the environment. The `create*` factory takes an explicit API key. Both
take `model` as the first argument.

| Factories | Creates |
| --- | --- |
| `zaiText(model, config?)` / `createZAIText(model, apiKey, config?)` | Chat adapter |
| `zaiSummarize(model, config?)` / `createZAISummarize(model, apiKey, config?)` | Summarization adapter |
| `zaiWebSearchTool(config?)` | Provider tool: Z.AI runs the web search |

`zaiByok` at `@tanstack/ai-zai/byok` is the BYOK descriptor for the key dialog
and the relay header.
