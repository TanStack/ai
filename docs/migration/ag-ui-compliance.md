---
title: Migrating to AG-UI Client-to-Server Compliance
---

> **TL;DR:** Upgrade `@tanstack/ai` and `@tanstack/ai-client` together. `useChat` messages, thinking, tools, and approvals keep working. The HTTP wire is a breaking 0.x change: extras live in `metadata.tanstack`, and messages have no `parts`. Wire messages use `content`, `toolCalls`, and fan-out `role: "tool"` / `role: "reasoning"` rows. In 1.0, the old `body` client option and the `data` wire field are gone. See [Upgrade to 1.0](./v1).

## What changed

`@tanstack/ai-client` POSTs an AG-UI `RunAgentInput` request body. Extra fields from the client go in `forwardedProps`.

### Old wire shape

```json
{
  "messages": [...],
  "data": {...}
}
```

### New wire shape

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

Servers read `forwardedProps`. A 1.0 client does not send `data`, so a server that reads `body.data` gets `undefined`.

The `messages` array on the wire is spec AG-UI. Anchors use `content`, `toolCalls`, and `metadata`. They do not include `parts`. Tool results and thinking parts go out as extra `{ role: "tool" }` and `{ role: "reasoning" }` messages.

## AG-UI event and message extras

This is a real behavior change. Upgrade `@tanstack/ai` and `@tanstack/ai-client` together.

Wire events keep spec fields and add `metadata`. TanStack extras live under `metadata.tanstack`. Public `StreamChunk` is spec-only.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Hello" }],
});

for await (const chunk of stream) {
  if (chunk.type === "RUN_FINISHED") {
    console.log(chunk.usage);
    console.log(chunk.metadata?.tanstack?.finishReason);
  }
}
```

What that means:

- **Wire events.** Spec fields stay at the top. Extra TanStack fields go in `metadata.tanstack`. Custom servers: see [Event metadata](../protocol/metadata).
- **Wire messages.** Use `content`, `toolCalls`, and fan-out `role: "tool"` / `role: "reasoning"`. There is no `parts` field on the wire.
- **`chat()` chunks.** In-process `chat()` still yields `TOOL_CALL_END.input` and TanStack `TokenUsage` (`promptTokens`). The SSE/HTTP wire converts `usage` to the spec array (`inputTokens`).
- **Usage.** Middleware `onUsage` still receives TanStack `TokenUsage` (`promptTokens`, `completionTokens`).

See [Stream Events](../chat/stream-events) for the `for await` branch, and [Middleware](../advanced/middleware) for `onUsage`.

## Renamed options

| Surface | 0.x | 1.0 |
|---|---|---|
| Client option (`useChat`, `ChatClient`) | `body: { ... }` | `forwardedProps: { ... }` |
| Server wire field | `body.data.X` | `body.forwardedProps.X`, or `params.forwardedProps.X` via `chatParamsFromRequest` |
| Server `chat()` option | `conversationId` | `threadId` (or rely on `chatParamsFromRequest`) |

0.x accepted both names. 1.0 accepts only the new names.

### Automated codemod

A jscodeshift codemod is available for the client-side renames. Run it against your codebase to flip every `useChat({ body })`, `new ChatClient({ body })`, `updateOptions({ body })`, Svelte `updateBody(...)`, and `chat({ conversationId })` to its canonical name in one pass:

```bash
npx jscodeshift \
  --parser=tsx \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/ag-ui-compliance/transform.ts \
  "src/**/*.{ts,tsx}"
```

Add `--dry --print` to preview changes first. The codemod is import-source–gated, so files that don't import from `@tanstack/ai*` packages are left untouched. See [`codemods/ag-ui-compliance/README.md`](https://github.com/TanStack/ai/blob/main/codemods/ag-ui-compliance/README.md) for the full transform list, conflict-handling rules, and limitations.

> **Server-side `body.data.X` rewrites are not automated.** Detecting whether a given `body.data.foo` read belongs to a TanStack AI route handler vs. unrelated code is unreliable in a syntactic codemod. Migrate those by hand using the Tier 2 / Tier 3 recipes below.

### `conversationId` → `threadId`

`threadId` is the AG-UI name for a stable conversation id. It correlates client and server devtools events. 1.0 removes `conversationId` from `chat()` and from `ChatMiddlewareContext`.

The client sends `threadId` as a top-level AG-UI field. It does not put `conversationId` in `forwardedProps`.

- If your server does not use `conversationId`, nothing changes. `chat()` makes a `threadId` when you do not pass one.
- If your server passes `chat({ conversationId })`, pass `chat({ threadId: params.threadId })`.
- If your middleware reads `ctx.conversationId`, read `ctx.threadId`.

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

## Server endpoint upgrade — choose your tier

The upgrade is **opt-in**: pick the tier that matches the features you use. Most servers fall into Tier 1 and need no code changes.

### Tier 1 — Minimum (no changes for most servers)

Keep reading `body.messages` and pass it through. `chat()` accepts mixed `UIMessage | ModelMessage` arrays and handles all AG-UI message-shape quirks internally: fan-out tool dedup, attaching `reasoning` rows to the next assistant as thinking, dropping `activity`, collapsing `developer` to `system`.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { serverTools } from './tools'

export async function POST(req: Request) {
  const body = await req.json()
  const provider = body.forwardedProps?.provider

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: body.messages, // AG-UI mixed shape — works directly
    tools: serverTools,
  })
  return toServerSentEventsResponse(stream)
}
```

If your endpoint reads `body.data.X`, change it to `body.forwardedProps.X` (or Tier 2's `params.forwardedProps.X`). A 1.0 client does not send `data`.

### Tier 2 — Recommended for production

Adopt `chatParamsFromRequest` when you want any of:

- **Clean 400 responses** for malformed bodies (Zod validation against `RunAgentInputSchema`).
- **Access to `forwardedProps`** for client-driven options (provider, model, temperature, etc.).
- **Access to AG-UI metadata** like `threadId`, `runId`, and `parentRunId` for observability, logging, or downstream forwarding (the runtime auto-generates these when not supplied; you only need to read them off `params` if you have a use for them).

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
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    tools: serverTools,
  })
  return toServerSentEventsResponse(stream)
}
```

`chatParamsFromRequest` reads `req.json()`, validates against AG-UI `RunAgentInputSchema`, and on failure **throws a 400 `Response`** that frameworks like TanStack Start, SolidStart, Remix, and React Router 7 return to the client automatically.

> **Framework note.** Next.js Route Handlers, SvelteKit, Hono, and raw Node do not auto-handle thrown `Response` objects. In those, either wrap the call with try/catch and return the caught Response, or use `chatParamsFromRequestBody(await req.json())` directly with your own error handling.

### Tier 3 — Optional: let the client advertise its tools

`mergeAgentTools` lets the client declare its tools in the request payload (`RunAgentInput.tools`) and have them registered server-side on a per-request basis. **This is purely a convenience over the existing pattern**, not a migration requirement.

If you were already registering client-side tools in your server's `tools` array — even ones without a `.server()` implementation — that pattern still works exactly as before. The runtime treats tools without `execute` as client-side and emits `ClientToolRequest` events; whether the registration came from a static array or `mergeAgentTools` is irrelevant.

Adopt this tier only if you want the client to drive tool advertisement (e.g., your client surfaces different tools per session and you'd rather not keep the server's static registry in sync). The only delta from Tier 2 is the `tools` line — wrap `serverTools` with `mergeAgentTools(serverTools, params.tools)`:

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
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    // `mergeAgentTools` returns a plain array — pass it straight to `tools`.
    tools: mergeAgentTools(serverTools, params.tools), // ← merges client-declared tools
  })
  return toServerSentEventsResponse(stream)
}
```

`mergeAgentTools` registers client-declared tools as no-execute stubs server-side. The runtime emits a `ClientToolRequest` event when the model calls one; the client executes via its registered handler and posts the result back.

> **Security — merging trusts the client to define part of the tool surface.**
> `params.tools` is attacker-controllable: a malicious or compromised client can
> put any `name` / `description` / `parameters` it likes in `RunAgentInput.tools`.
> Merging them means those definitions are advertised to the model. Server tools
> still win on name collision (a client **cannot** shadow or hijack a server
> tool's `execute`), and client-declared tools are no-execute — they only ever
> run by round-tripping back to that same client. But a client can still **expand
> the advertised tool surface** and **inject arbitrary text into the model's
> context** through tool names and descriptions (a prompt-injection vector).
>
> **The safe default is to register your tool definitions statically** in the
> server's `tools` array (including client-executed tools — a definition with no
> `.server()` still works) and **not** call `mergeAgentTools`. Then any tools a
> client declares in the payload are ignored: the model is never told about
> them, so it never calls them and they can't run. Only reach for
> `mergeAgentTools` when you genuinely want the client to drive tool
> advertisement and you trust that client.

## `forwardedProps` security (Tier 2+ only)

Skip this section if you're on Tier 1. `forwardedProps` is only surfaced when you opt into `chatParamsFromRequest` (or `chatParamsFromRequestBody`).

`forwardedProps` is arbitrary client-controlled JSON. **Do not** spread it directly into `chat({...})`:

```ts ignore
// 🚫 UNSAFE — a client could override `adapter`, `model`, `tools`, system prompts, anything
chat({
  adapter: openaiText('gpt-5.5'),
  ...params,
  ...params.forwardedProps,
})
```

Always destructure the specific fields you intend to forward:

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

  // ✅ SAFE — explicit allowlist. Sampling params live in modelOptions under
  // each provider's native key (OpenAI: temperature / max_output_tokens).
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
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

### Mapping forwarded values into runtime context

TanStack AI's `chat({ context })` is typed runtime context for tools and middleware. It is separate from AG-UI `RunAgentInput.context` and is not populated automatically from protocol fields.

If a client value should become available to server tools or middleware, validate it from `forwardedProps` and build the runtime context explicitly:

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
  adapter: openaiText('gpt-5.5'),
  messages: params.messages,
  tools: serverTools,
  context: {
    userId: session.user.id,
    tenantId,
  },
})
```

## Client-side: one rename

`useChat` and the connection adapters (`fetchServerSentEvents`, `fetchHttpStream`) handle the new wire format internally. Existing `UIMessage` state is unchanged. The tools you pass to `useChat({ tools })` are now automatically advertised to the server in the request payload.

### `body` → `forwardedProps`

1.0 removes the `body` option on `useChat` and `ChatClient`. Use `forwardedProps`:

```diff
  useChat({
    connection: fetchServerSentEvents('/api/chat'),
-   body: { provider: 'openai', model: 'gpt-6.1-sol' },
+   forwardedProps: { provider: 'openai', model: 'gpt-6.1-sol' },
  })
```

On Svelte, `updateBody` is now `updateForwardedProps`.

### Optional: explicit thread control

If you instantiated a `ChatClient` directly and want to control the thread identifier, pass `threadId` via the constructor options:

```ts
import { ChatClient } from '@tanstack/ai-client'
import { fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  threadId: 'persistent-thread-from-storage',
  connection: fetchServerSentEvents('/api/chat'),
})
```

If you don't pass `threadId`, one is generated automatically and persists for the lifetime of the `ChatClient` instance. A fresh `runId` is generated for every send.

## Tool-merge semantics

- **Server tools win on name collision.** A tool registered server-side via `toolDefinition().server(...)` always executes server-side.
- **Client-only tools become no-execute stubs** in `chat()` (when registered via `mergeAgentTools`). The runtime emits a `ClientToolRequest` event back to the client; the client's registered handler (the `.client(...)` tool in the hook's `tools` array) executes locally and posts the result.
- **Dual-handler (both have it):** server executes, then `chat-client.ts`'s `onToolCall` fires the client's handler as a UI side-effect when the streamed tool result event arrives. The server's result is authoritative for the conversation.

## Talking to a foreign AG-UI server

A `@tanstack/ai-client` request hitting a foreign AG-UI server:

- ✅ Single-turn user messages work — content is mirrored to AG-UI's `content` field.
- ✅ Server-emitted events stream and render correctly.
- ✅ Multi-turn history that includes tool results from prior turns: the foreign server reads them via the AG-UI fan-out duplicates we send (separate `{role:'tool',...}` messages).
- ⚠️ Client-only tools are sent in the AG-UI `tools` field; whether the foreign server actually invokes them depends on its tool-calling logic.

## Talking to a TanStack server from a foreign AG-UI client

Pure AG-UI `RunAgentInput` payloads (no TanStack `parts` field) work end-to-end:

- Tool messages pass through as `ModelMessage` entries with `role: 'tool'`.
- `reasoning` messages attach to the next assistant as thinking. Spec `encryptedValue` becomes `ThinkingPart.signature`.
- `activity` messages are dropped (no TanStack equivalent).
- `developer` messages are collapsed to `system` role.

## `@ag-ui/core` bump

`@tanstack/ai` now depends on `@ag-ui/core@0.1.1-canary.beta.0`. If your code imports types from `@tanstack/ai` that re-export AG-UI types, you may need minor type adjustments — see the changeset for specifics.

### zod is no longer installed for you

`@ag-ui/core` used to list `zod` as a runtime dependency, so every
`@tanstack/ai` install pulled zod in transitively. As of `0.1.x` it declares zod
as an optional peer instead, and `@tanstack/ai` no longer uses zod anywhere —
the package now ships with no schema-validation runtime at all.

`chatParamsFromRequest` / `chatParamsFromRequestBody` were the only zod
consumers: they validated the request body with AG-UI's `RunAgentInputSchema`.
They now validate the same `RunAgentInput` contract structurally. Their
signatures, their thrown types (`AGUIError`, and a 400 `Response` from
`chatParamsFromRequest`), and the `parts` passthrough on messages are all
unchanged. The one visible difference is friendlier failures — the error names
the offending field, e.g.:

```
Request body is not a valid AG-UI RunAgentInput. ... Validation errors: messages[1].content must be a string
```

zod is still fully supported for defining tools; it is just no longer installed
on your behalf. If your project used zod without declaring it — relying on the
transitive copy — add it explicitly:

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

If you define tools with a different Standard Schema library (ArkType, Valibot),
you can now drop zod entirely.

## Out of scope (existing behavior preserved)

- **Reasoning replay to LLM providers.** This migration does not change that path. Signed `ThinkingPart`s convert to `ModelMessage.thinking` and replay in original order, including around provider-executed tools. Unsigned thinking is not sent back.
- **AG-UI `state` and `context` fields.** Surfaced on `chatParamsFromRequestBody`'s return value as `state` and `aguiContext`. They are protocol-level fields available for your endpoint to inspect/forward. TanStack AI's typed runtime context is the separate `chat({ context })` option; validate and map AG-UI values into it yourself if you want tools or middleware to read them.
