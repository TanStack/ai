---
title: Migrating to AG-UI Client-to-Server Compliance
description: "Move a 0.x chat endpoint to the AG-UI wire format: read forwardedProps, not body.data, rename body and conversationId, and keep forwarded values safe."
---

`@tanstack/ai-client` posts an AG-UI `RunAgentInput` body. Extra client fields arrive in `forwardedProps`, not `body.data`.

On the client, `useChat` messages, thinking, tools, and approvals keep working. The breaking change is on the HTTP wire and in a few option names. In 1.0, the old `body` client option and the `data` wire field are gone. For every other 1.0 change, see [Upgrade to 1.0](./v1).

## Upgrade

1. Upgrade `@tanstack/ai` and `@tanstack/ai-client` (and your framework package) at the same time.
2. [Run the codemod](#run-the-codemod). It renames `body` and `conversationId` for you.
3. Change your server to read `forwardedProps`. Pick a [tier](#update-your-server-endpoint).
4. If you read client values from `forwardedProps`, [allowlist each field](#keep-forwardedprops-safe).
5. Do the [done check](#done).

## Renamed options

| Surface | 0.x | 1.0 |
|---|---|---|
| Client option (`useChat`, `ChatClient`) | `body: { ... }` | `forwardedProps: { ... }` |
| Server wire field | `body.data.X` | `body.forwardedProps.X`, or `params.forwardedProps.X` from `chatParamsFromRequest` |
| Server `chat()` option | `conversationId` | `threadId` (or use `params.threadId` from `chatParamsFromRequest`) |

0.x accepted both names. 1.0 accepts only the new names.

```diff
  useChat({
    connection: fetchServerSentEvents('/api/chat'),
-   body: { provider: 'openai', model: 'gpt-6.1-sol' },
+   forwardedProps: { provider: 'openai', model: 'gpt-6.1-sol' },
  })
```

On Svelte, `updateBody` is now `updateForwardedProps`.

## Run the codemod

```bash
npx jscodeshift \
  --parser=tsx \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/ag-ui-compliance/transform.ts \
  "src/**/*.{ts,tsx}"
```

To see the changes before the codemod writes them, add `--dry --print`.

The codemod renames `body` to `forwardedProps` in `useChat({ body })`, `new ChatClient({ body })`, and `updateOptions({ body })`. It also renames Svelte `updateBody(...)` to `updateForwardedProps(...)`, and `chat({ conversationId })` to `chat({ threadId })`.

It changes a file only when the file imports these names from a `@tanstack/ai*` package. For the full transform list, the conflict rules, and the limits, see [`codemods/ag-ui-compliance/README.md`](https://github.com/TanStack/ai/blob/main/codemods/ag-ui-compliance/README.md).

> [!NOTE]
> The codemod does not change server reads of `body.data.X`. A syntax-only codemod cannot tell a TanStack AI route handler from other code. Change these reads by hand, with the tiers below.

## Update your server endpoint

Pick the tier that matches the features you use. Most servers fit Tier 1.

### Tier 1: keep `body.messages`

Keep reading `body.messages`, and pass the array to `chat()`. `chat()` accepts a mixed `UIMessage | ModelMessage` array, and it handles the AG-UI message shapes for you.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { serverTools } from './tools'

export async function POST(req: Request) {
  const body = await req.json()

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: body.messages, // AG-UI mixed shape. Pass it as it is.
    threadId: body.threadId, // The client sends it at the top level.
    tools: serverTools,
  })
  return toServerSentEventsResponse(stream)
}
```

If your endpoint reads `body.data.X`, change it to `body.forwardedProps.X` (or `params.forwardedProps.X` in Tier 2). A 1.0 client does not send `data`.

### Tier 2: recommended for production

Use `chatParamsFromRequest` when you want one of these:

- **A clean 400 response** for a body that is not a valid AG-UI `RunAgentInput`.
- **`forwardedProps`** for options that the client sends (provider, model, and more).
- **The AG-UI ids** `threadId`, `runId`, and `parentRunId`. `chat()` needs `threadId`, so pass `params.threadId`. `chat()` makes a `runId` when you do not pass one.

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { serverTools } from './tools'

export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    tools: serverTools,
  })
  return toServerSentEventsResponse(stream)
}
```

`chatParamsFromRequest` reads `req.json()` and validates the body against the AG-UI `RunAgentInput` contract. If the body is not valid, it **throws a 400 `Response`**. TanStack Start, SolidStart, Remix, and React Router 7 send that response to the client for you.

> [!NOTE]
> Next.js Route Handlers, SvelteKit, Hono, and raw Node do not handle a thrown `Response`. In these frameworks, wrap the call in try/catch and return the caught `Response`. Or call `await chatParamsFromRequestBody(await req.json())` and handle the error yourself.

### Tier 3: let the client advertise its tools

This tier is optional. It is a convenience, not a migration step.

`mergeAgentTools` takes the tools that the client declares in the request (`RunAgentInput.tools`) and adds them to the server tools for this one request. The only change from Tier 2 is the `tools` line:

```ts
import {
  chat,
  chatParamsFromRequest,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { serverTools } from './tools'

export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    // mergeAgentTools returns a plain array. Pass it to `tools`.
    tools: mergeAgentTools(serverTools, params.tools),
  })
  return toServerSentEventsResponse(stream)
}
```

Use this tier only if the client must decide which tools to advertise, for example when the client shows different tools in each session.

You do not need it for client tools. A client tool in the static `tools` array of your server still works, also when it has no `.server()` implementation. The runtime treats a tool with no `execute` as a client tool, from a static array or from `mergeAgentTools`.

> [!WARNING]
> Merging lets the client define part of your tool list. `params.tools` comes from the client, so a bad client can send any `name`, `description`, or `parameters`, and the model sees them.
>
> - A client cannot replace a server tool. The server tool wins on a name collision.
> - A client-declared tool has no `execute`. It runs only on that same client.
> - A client can still add tools that the model sees. Through tool names and descriptions, it can put any text in the context of the model. This is a prompt-injection risk.
>
> The safe default is to register your tool definitions in the static `tools` array of the server, and not to call `mergeAgentTools`. Then the model never sees the tools that a client declares. Use `mergeAgentTools` only when you trust the client.

## Keep `forwardedProps` safe

This section is for Tier 2 and Tier 3. You get `forwardedProps` only from `chatParamsFromRequest` or `chatParamsFromRequestBody`.

`forwardedProps` is JSON that the client controls. Do not spread it into `chat({...})`:

```ts ignore
// UNSAFE: a client can replace the adapter, the model, the tools, the system prompts, and more
chat({
  adapter: openaiText('gpt-6.1-sol'),
  ...params,
  ...params.forwardedProps,
})
```

Read each field that you allow, and check its type:

```ts
import {
  chat,
  chatParamsFromRequest,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { serverTools } from './tools'

export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req)

  // SAFE: an explicit allowlist. Sampling options go in modelOptions, under
  // the key names of the provider (OpenAI: temperature, max_output_tokens).
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    tools: mergeAgentTools(serverTools, params.tools),
    modelOptions: {
      temperature:
        typeof params.forwardedProps.temperature === 'number'
          ? params.forwardedProps.temperature
          : undefined,
      max_output_tokens:
        typeof params.forwardedProps.maxTokens === 'number'
          ? params.forwardedProps.maxTokens
          : undefined,
    },
  })
  return toServerSentEventsResponse(stream)
}
```

## Done

Your server reads `forwardedProps` (or `params.forwardedProps`), no code reads `body.data`, and a chat message streams a reply.

## Advanced

### The wire shape

Old wire shape:

```json
{
  "messages": [...],
  "data": {...}
}
```

New wire shape:

```json
{
  "threadId": "thread-...",
  "runId": "run-...",
  "state": {},
  "messages": [...],
  "tools": [...],
  "context": [],
  "forwardedProps": {...}
}
```

The `messages` array on the wire is spec AG-UI:

- Messages use `content`, `toolCalls`, and `metadata`. They have no `parts` field.
- Tool results go out as extra `{ role: "tool" }` messages.
- Thinking goes out as extra `{ role: "reasoning" }` messages.

The tools that you pass to `useChat({ tools })` go to the server in the request body.

### Event and message extras

This is a real behavior change, so upgrade `@tanstack/ai` and `@tanstack/ai-client` together.

Wire events keep the spec fields and add `metadata`. The TanStack extras are in `metadata.tanstack`. The public `StreamChunk` type is spec-only.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello" }],
  threadId: "thread-1",
});

for await (const chunk of stream) {
  if (chunk.type === "RUN_FINISHED") {
    console.log(chunk.usage);
    console.log(chunk.metadata?.tanstack?.finishReason);
  }
}
```

- **Wire events.** The spec fields stay at the top. The TanStack fields go in `metadata.tanstack`. For custom servers, see [Event metadata](../protocol/metadata).
- **Wire messages.** They use `content`, `toolCalls`, and extra `role: "tool"` and `role: "reasoning"` messages. They have no `parts` field.
- **`chat()` chunks.** In-process `chat()` still yields `TOOL_CALL_END.input` and the TanStack `TokenUsage` (`promptTokens`). The SSE and HTTP wire changes `usage` to the spec array (`inputTokens`).
- **Usage in middleware.** `onUsage` still gets the TanStack `TokenUsage` (`promptTokens`, `completionTokens`).

For the `for await` loop, see [Stream Events](../chat/stream-events). For `onUsage`, see [Middleware](../advanced/middleware).

### `conversationId` and `threadId`

`threadId` is the AG-UI name for a stable conversation id. It connects the client and server devtools events. 1.0 removes `conversationId` from `chat()` and from `ChatMiddlewareContext`.

The client sends `threadId` as a top-level AG-UI field. It does not put `conversationId` in `forwardedProps`.

- If your server does not use `conversationId`, pass `chat({ threadId: params.threadId })`. `chat()` needs a `threadId` and does not make one.
- If your server passes `chat({ conversationId })`, pass `chat({ threadId: params.threadId })`.
- If your middleware reads `ctx.conversationId`, read `ctx.threadId`.

The codemod renames the `conversationId` key, but it does not change the value. Check the value after the codemod runs:

```ts ignore
// Before: explicit conversationId plumbing
const params = await chatParamsFromRequest(req)
chat({
  messages: params.messages,
  conversationId: params.forwardedProps.conversationId,
})

// After: forward the AG-UI threadId
const params = await chatParamsFromRequest(req)
chat({ messages: params.messages, threadId: params.threadId })
```

### Set the thread id on the client

Pass `threadId` to the `ChatClient` constructor. It is required:

```ts
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  threadId: 'persistent-thread-from-storage',
  connection: fetchServerSentEvents('/api/chat'),
})
```

The client does not make a `threadId`. The one you pass stays the same for the life of the `ChatClient` instance. Each send gets a new `runId`.

### Map forwarded values into runtime context

`chat({ context })` is the typed runtime context for tools and middleware. It is a different thing from the AG-UI `RunAgentInput.context`, and protocol fields do not fill it.

If a client value must reach your server tools or middleware, read it from `forwardedProps`, check it, and build the context yourself:

```ts
import {
  chat,
  chatParamsFromRequest,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { serverTools } from './tools'
import { session, defaultTenantId, req } from './context'

const params = await chatParamsFromRequest(req)

const tenantId =
  typeof params.forwardedProps.tenantId === 'string'
    ? params.forwardedProps.tenantId
    : defaultTenantId

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: params.messages,
  threadId: params.threadId,
  tools: serverTools,
  context: {
    userId: session.user.id,
    tenantId,
  },
})
```

### Tool-merge rules

- **The server tool wins on a name collision.** A tool registered on the server with `toolDefinition().server(...)` always runs on the server.
- **A client-only tool becomes a stub with no `execute`** in `chat()`, when you register it with `mergeAgentTools`. When the model calls it, the run ends with a client-tool interrupt. The client runs its registered handler (the `.client(...)` tool in the `tools` array of the hook), then sends the result back.
- **Both sides have the tool.** The server runs it. When the tool result event arrives, the `onToolCall` of `chat-client.ts` also runs the client handler, as a UI side effect. The result from the server is the one that the conversation keeps.

### Talk to a foreign AG-UI server

When a `@tanstack/ai-client` request goes to an AG-UI server that is not TanStack AI:

- **Single-turn user messages work.** The client copies the content to the AG-UI `content` field.
- **Events from the server stream and render.**
- **Multi-turn history with tool results works.** The foreign server reads the tool results from the extra `{ role: 'tool' }` messages that the client sends.
- **Client-only tools go in the AG-UI `tools` field.** Whether the foreign server calls them depends on its own tool logic.

### Talk to a TanStack server from a foreign AG-UI client

A spec AG-UI `RunAgentInput` body (with no TanStack `parts` field) works end to end:

- Tool messages pass through as `ModelMessage` entries with `role: 'tool'`.
- `reasoning` messages attach to the next assistant message as thinking. The spec `encryptedValue` becomes `ThinkingPart.signature`.
- `activity` messages are dropped. TanStack AI has no equivalent.
- `developer` messages become `system` messages.

### `@ag-ui/core` and zod

The AG-UI compliance release moved `@tanstack/ai` to `@ag-ui/core@0.1.1-canary.beta.0`. In 1.0, `@tanstack/ai` depends on `@ag-ui/core@1.0.0`. If your code imports AG-UI types that `@tanstack/ai` re-exports, small type changes can be necessary.

`@ag-ui/core` lists `zod` as an optional peer, not as a dependency. `@tanstack/ai` does not use zod at runtime. So an install of `@tanstack/ai` does not install zod for you.

`chatParamsFromRequest` and `chatParamsFromRequestBody` validate the `RunAgentInput` contract with their own structural checks, not with zod. These things do not change:

- Their signatures.
- The errors they throw: an `AGUIError` from `chatParamsFromRequestBody`, and a 400 `Response` from `chatParamsFromRequest`.
- The `parts` passthrough on messages.

The error message names the field that is wrong, for example:

```
Request body is not a valid AG-UI RunAgentInput. ... Validation errors: messages[1].content must be a string
```

You can still define tools with zod. If your project used zod without a dependency entry (from the transitive copy), add zod:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: zod
vue: zod
solid: zod
svelte: zod
preact: zod
angular: zod
vanilla: zod
octane: zod

<!-- ::end:tabs -->

If you define tools with a different Standard Schema library (ArkType, Valibot), you can remove zod.

### What this change does not touch

- **Reasoning replay to LLM providers.** Signed `ThinkingPart`s become `ModelMessage.thinking`, and they replay in the original order, also around provider-executed tools. Unsigned thinking does not go back to the provider.
- **The AG-UI `state` and `context` fields.** `chatParamsFromRequestBody` returns them as `state` and `aguiContext`. You can read them or forward them. The typed runtime context is the separate `chat({ context })` option. If tools or middleware must read AG-UI values, check them and map them into `chat({ context })` yourself.
