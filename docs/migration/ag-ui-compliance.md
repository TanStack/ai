---
title: Migrating to AG-UI Client-to-Server Compliance
---

# Migrating to AG-UI Client-to-Server Compliance

> **TL;DR:** Upgrade `@tanstack/ai` and `@tanstack/ai-client` together. The HTTP wire format changed to AG-UI `RunAgentInput`. Server endpoints must use `chatParamsFromRequestBody` and `mergeAgentTools`. Clients have nothing to do — `useChat` and the connection adapters handle the new format internally.

## What changed

`@tanstack/ai-client` now POSTs an AG-UI 0.0.52 `RunAgentInput` request body. The previous shape (`{ messages, data, ...optionsBody }`) is no longer accepted by `@tanstack/ai`'s server helpers.

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

The `messages` array carries TanStack `UIMessage` anchors with `parts` intact, plus AG-UI mirror fields (`content`, `toolCalls`) so strict AG-UI servers can parse it. Tool results and thinking parts are additionally emitted as separate `{role:'tool',...}` and `{role:'reasoning',...}` fan-out messages alongside the anchors.

## Server endpoint upgrade

### Before

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'

export async function POST(req: Request) {
  const { messages } = await req.json()
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
    tools: serverTools,
  })
  return toServerSentEventsResponse(stream)
}
```

### After

```ts
import {
  chat,
  chatParamsFromRequestBody,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'

export async function POST(req: Request) {
  let params
  try {
    params = await chatParamsFromRequestBody(await req.json())
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : 'Bad request',
      { status: 400 },
    )
  }

  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages: params.messages,
    tools: mergeAgentTools(serverTools, params.tools),
    threadId: params.threadId,
    runId: params.runId,

    // Explicitly allowlist forwardedProps — see security note below
    temperature:
      typeof params.forwardedProps.temperature === 'number'
        ? params.forwardedProps.temperature
        : undefined,
    maxTokens:
      typeof params.forwardedProps.maxTokens === 'number'
        ? params.forwardedProps.maxTokens
        : undefined,
  })

  return toServerSentEventsResponse(stream)
}
```

`chatParamsFromRequestBody` validates the body against `RunAgentInputSchema` from `@ag-ui/core` and throws an `AGUIError` on a malformed shape. Surface this as HTTP 400.

## `forwardedProps` security

`forwardedProps` is arbitrary client-controlled JSON. **Do not** spread it directly into `chat({...})`:

```ts
// 🚫 UNSAFE — a client could override `adapter`, `model`, `tools`, system prompts, anything
chat({
  adapter: openaiText('gpt-4o'),
  ...params,
  ...params.forwardedProps,
})
```

Always destructure the specific fields you intend to forward:

```ts
// ✅ SAFE — explicit allowlist
chat({
  adapter: openaiText('gpt-4o'),
  messages: params.messages,
  tools: mergeAgentTools(serverTools, params.tools),
  threadId: params.threadId,
  runId: params.runId,
  temperature: typeof params.forwardedProps.temperature === 'number'
    ? params.forwardedProps.temperature
    : undefined,
})
```

## Client-side: nothing to do

`useChat` and the connection adapters (`fetchServerSentEvents`, `fetchHttpStream`) handle the new wire format internally. Existing `UIMessage` state is unchanged. `clientTools(...)` declarations are now automatically advertised to the server in the request payload.

If you instantiated a `ChatClient` directly and want to control the thread identifier, pass `threadId` via the constructor options:

```ts
const client = new ChatClient({
  threadId: 'persistent-thread-from-storage',
  connection: fetchServerSentEvents('/api/chat'),
  tools: [/* clientTools */],
})
```

If you don't pass `threadId`, one is generated automatically and persists for the lifetime of the `ChatClient` instance. A fresh `runId` is generated for every send.

## Tool-merge semantics

- **Server tools win on name collision.** A tool registered server-side via `toolDefinition().server(...)` always executes server-side.
- **Client-only tools become no-execute stubs** in `chat()`. The runtime emits a `ClientToolRequest` event back to the client; the client's registered handler (via `clientTools(...)`) executes locally and posts the result.
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
- `reasoning` messages are dropped (no LLM-replay equivalent today).
- `activity` messages are dropped (no TanStack equivalent).
- `developer` messages are collapsed to `system` role.

## `@ag-ui/core` bump

`@tanstack/ai` now depends on `@ag-ui/core@^0.0.52`. If your code imports types from `@tanstack/ai` that re-export AG-UI types, you may need minor type adjustments — see the changeset for specifics.

## Out of scope (existing behavior preserved)

- **Reasoning replay to LLM providers.** TanStack still drops `ThinkingPart` at the `UIMessage`→`ModelMessage` boundary (pre-existing behavior). Providers like Anthropic that require thinking blocks to be replayed for extended thinking continuation remain a separate concern, tracked outside this migration.
- **AG-UI `state` and `context` fields.** Surfaced on `chatParamsFromRequestBody`'s return value but not yet wired into `chat()`. They're available for your endpoint to inspect/forward, but the runtime ignores them.
- **PHP and Python server packages.** No `chatParamsFromRequestBody` parity yet. Their examples temporarily lag on the old shape until the matching helpers ship.
