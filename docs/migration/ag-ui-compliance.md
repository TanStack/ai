---
title: Migrating to AG-UI Client-to-Server Compliance
---

# Migrating to AG-UI Client-to-Server Compliance

> **TL;DR:** This release is fully backward compatible. Upgrade `@tanstack/ai` and `@tanstack/ai-client` together and existing code keeps working — both the legacy `body` client option and the legacy `data` server-side wire field continue to function unchanged. The HTTP wire format gained AG-UI `RunAgentInput` fields (`threadId`, `runId`, `tools`, `forwardedProps`, etc.) for full AG-UI compliance, and the legacy fields are emitted alongside them as a deprecation bridge. New helpers (`chatParamsFromRequest`, `mergeAgentTools`) are available for opt-in conveniences. Migrate to the new names when convenient — both `body` (client) and `data` (wire) will be removed in a future major release.

## What changed

`@tanstack/ai-client` now POSTs an AG-UI 0.0.52 `RunAgentInput` request body. The previous fields (`messages`, `data`) are emitted alongside the new AG-UI fields so existing servers and clients keep working without code changes.

### Old wire shape

```json
{
  "messages": [...],
  "data": {...}
}
```

### New wire shape (with deprecation bridge)

```json
{
  "threadId": "thread-...",
  "runId": "run-...",
  "state": {},
  "messages": [...],
  "tools": [...],
  "context": [],
  "forwardedProps": {...},
  "data": {...}
}
```

`forwardedProps` and `data` carry the same content. New servers should read `forwardedProps`; legacy servers reading `data` keep working unchanged. The `data` field will be removed in a future major release.

The `messages` array carries TanStack `UIMessage` anchors with `parts` intact, plus AG-UI mirror fields (`content`, `toolCalls`) so strict AG-UI servers can parse it. Tool results and thinking parts are additionally emitted as separate `{role:'tool',...}` and `{role:'reasoning',...}` fan-out messages alongside the anchors.

## Backward compatibility & deprecation timeline

This release introduces three compatibility bridges:

| Surface | Before | After (deprecated, still works) | Recommended |
|---|---|---|---|
| Client option (`useChat`, `ChatClient`) | `body: { ... }` | `body: { ... }` | `forwardedProps: { ... }` |
| Server wire field | `body.data.X` | `body.data.X` (emitted as a mirror of `forwardedProps`) | `body.forwardedProps.X`, or `params.forwardedProps.X` via `chatParamsFromRequest` |
| Server `chat()` option | `conversationId` | `conversationId` (still accepted) | `threadId` (or rely on `chatParamsFromRequest`) |

All three bridges will be removed in the next major release. Until then, you can mix old and new freely — if both `body` and `forwardedProps` are passed to `useChat`, they are merged with `forwardedProps` winning on key collision.

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

`conversationId` was the pre-AG-UI name for "a stable identifier for this conversation, used to correlate client and server devtools events." AG-UI's `threadId` is the same concept under the standard name. **`conversationId` is now a deprecated alias of `threadId` throughout the API** — passing either name resolves to the same internal value.

**What changed on the wire:** the client no longer auto-emits `forwardedProps.conversationId`. It now sends only the AG-UI top-level `threadId` field. Anyone who explicitly sets `useChat({ forwardedProps: { conversationId } })` (or the legacy `body`) still has their value passed through unchanged.

**What this means for server code:**

- **Server code that doesn't reference `conversationId` is unaffected.** When `chat({ conversationId })` is omitted, the runtime auto-generates a stable `threadId` per request and uses it for devtools event correlation.
- **`chat({ conversationId: 'foo' })` still works** — `conversationId` is now a deprecated alias for `threadId`, resolved internally. No code change required.
- **`chat({ threadId: 'foo' })` is the canonical form** — prefer it in new code. If both are passed, `threadId` wins.
- **`TextOptions.conversationId` is `@deprecated`** in JSDoc and will be removed in a future major release.

> **One real behavior change to verify.** If your server reads `body.forwardedProps?.conversationId` (or the legacy `body.data?.conversationId`) and threads it into `chat({ conversationId })`, the value will now be `undefined` for any client running the upgraded `@tanstack/ai-client`, because the client no longer auto-emits `conversationId`. The fall-back to an auto-generated `threadId` keeps devtools correlation working *within* a single request, but **threadId stability across requests now depends on the client sending its own `threadId`** (which `ChatClient` does — see the AG-UI top-level `threadId` field surfaced via `params.threadId`). To restore the prior cross-request stable identifier, switch the server to read `params.threadId` and pass it to `chat({ threadId: params.threadId })`, or rely on the auto-fallback if cross-request stability is not required.

**Custom middleware:** `ChatMiddlewareContext` now exposes both `ctx.threadId` (canonical) and `ctx.conversationId` (deprecated alias, always equal to `ctx.threadId`). New middleware should read `ctx.threadId`; existing middleware reading `ctx.conversationId` keeps working.

```ts
// Before — explicit conversationId plumbing
const params = await chatParamsFromRequest(req)
chat({
  messages: params.messages,
  conversationId: params.forwardedProps.conversationId, // ← auto-emitted by old client
})

// After — drop the plumbing entirely
const params = await chatParamsFromRequest(req)
chat({ messages: params.messages })
// devtools correlation auto-uses the resolved threadId
```

## Server endpoint upgrade — choose your tier

The upgrade is **opt-in**: pick the tier that matches the features you use. Most servers fall into Tier 1 and need no code changes.

### Tier 1 — Minimum (no changes for most servers)

Keep reading `body.messages` and pass it through. `chat()` accepts mixed `UIMessage | ModelMessage` arrays and handles all AG-UI message-shape quirks internally — fan-out tool dedup, dropping `reasoning`/`activity`, collapsing `developer` → `system`.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'

export async function POST(req: Request) {
  const body = await req.json()
  const provider = body.data?.provider // ← still works (legacy mirror)
  // or, equivalently and recommended:
  // const provider = body.forwardedProps?.provider

  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages: body.messages, // AG-UI mixed shape — works directly
    tools: serverTools,
  })
  return toServerSentEventsResponse(stream)
}
```

If your existing endpoint reads `body.data.X`, **leave it as-is** — the wire emits a `data` field that mirrors `forwardedProps` exactly until the next major release. Migrate to `body.forwardedProps.X` (or Tier 2's `params.forwardedProps.X`) at your convenience.

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
import { openaiText } from '@tanstack/ai-openai/adapters'

export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req)
  const stream = chat({
    adapter: openaiText('gpt-4o'),
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
import { openaiText } from '@tanstack/ai-openai/adapters'

export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req)
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages: params.messages,
    tools: mergeAgentTools(serverTools, params.tools), // ← merges client-declared tools
  })
  return toServerSentEventsResponse(stream)
}
```

`mergeAgentTools` registers client-declared tools as no-execute stubs server-side. The runtime emits a `ClientToolRequest` event when the model calls one; the client executes via its registered handler and posts the result back.

## `forwardedProps` security (Tier 2+ only)

Skip this section if you're on Tier 1. `forwardedProps` is only surfaced when you opt into `chatParamsFromRequest` (or `chatParamsFromRequestBody`).

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
  temperature:
    typeof params.forwardedProps.temperature === 'number'
      ? params.forwardedProps.temperature
      : undefined,
  maxTokens:
    typeof params.forwardedProps.maxTokens === 'number'
      ? params.forwardedProps.maxTokens
      : undefined,
})
```

## Client-side: nothing required, one rename recommended

`useChat` and the connection adapters (`fetchServerSentEvents`, `fetchHttpStream`) handle the new wire format internally. Existing `UIMessage` state is unchanged. `clientTools(...)` declarations are now automatically advertised to the server in the request payload.

### `body` → `forwardedProps` (recommended)

The `body` option on `useChat` / `ChatClient` is now `@deprecated` in favor of `forwardedProps`. Both are accepted, both populate the same wire field. Migrate at your convenience:

```ts
// Before — still works, but deprecated
useChat({
  connection: fetchServerSentEvents('/api/chat'),
  body: { provider: 'openai', model: 'gpt-4o' },
})

// After — recommended
useChat({
  connection: fetchServerSentEvents('/api/chat'),
  forwardedProps: { provider: 'openai', model: 'gpt-4o' },
})
```

If both are passed during a partial migration, `forwardedProps` wins on key collision so stale `body` values don't shadow new ones.

The Svelte equivalent renames `updateBody` → `updateForwardedProps`. The legacy `updateBody` is retained and marked `@deprecated`.

### Optional: explicit thread control

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
- **Client-only tools become no-execute stubs** in `chat()` (when registered via `mergeAgentTools`). The runtime emits a `ClientToolRequest` event back to the client; the client's registered handler (via `clientTools(...)`) executes locally and posts the result.
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
