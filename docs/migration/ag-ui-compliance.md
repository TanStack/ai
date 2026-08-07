---
title: Migrating to AG-UI Client-to-Server Compliance
---

# Migrating to AG-UI Client-to-Server Compliance

**Backward compatible.** Upgrade `@tanstack/ai` + `@tanstack/ai-client` together; legacy `body` (client) and `data` (wire) still work. Wire now includes AG-UI `RunAgentInput` fields. Prefer new names before the next major removes the bridges.

## Wire shape

```json
// Old
{ "messages": [...], "data": {...} }

// New (with deprecation bridge)
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

`forwardedProps` and `data` carry the same content. Read `forwardedProps` on new servers; `data` remains until the next major.

`messages` keep TanStack `UIMessage` `parts` plus AG-UI mirrors (`content`, `toolCalls`). Tool results and thinking also fan out as separate `{role:'tool'}` / `{role:'reasoning'}` messages.

## Compatibility bridges

| Surface | Still works | Prefer |
|---|---|---|
| Client option | `body: { ... }` | `forwardedProps: { ... }` |
| Server wire | `body.data.X` | `body.forwardedProps.X` or `params.forwardedProps` via `chatParamsFromRequest` |
| Server `chat()` | `conversationId` | `threadId` |

If both `body` and `forwardedProps` are passed, `forwardedProps` wins on collision.

### Codemod (client renames)

```bash
npx jscodeshift \
  --parser=tsx \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/ag-ui-compliance/transform.ts \
  "src/**/*.{ts,tsx}"
```

Preview: `--dry --print`. Import-gated to `@tanstack/ai*`. Details: [`codemods/ag-ui-compliance/README.md`](https://github.com/TanStack/ai/blob/main/codemods/ag-ui-compliance/README.md).

Server `body.data.X` rewrites are **not** automated — migrate by hand (Tier 2/3 below).

### `conversationId` → `threadId`

Same concept under the AG-UI name. `conversationId` is a deprecated alias of `threadId`.

- Client no longer auto-emits `forwardedProps.conversationId`; it sends top-level `threadId`.
- Servers that only read `body.forwardedProps?.conversationId` / `body.data?.conversationId` get `undefined` from upgraded clients. Cross-request stability needs client `threadId` (ChatClient sends it) → pass `chat({ threadId: params.threadId })`, or rely on auto-generated per-request id.
- Middleware: prefer `ctx.threadId`; `ctx.conversationId` still equals it.

```ts ignore
// Before
const params = await chatParamsFromRequest(req)
chat({
  messages: params.messages,
  conversationId: params.forwardedProps.conversationId,
})

// After
const params = await chatParamsFromRequest(req)
chat({ messages: params.messages })
// or chat({ messages: params.messages, threadId: params.threadId })
```

## Server upgrade tiers

### Tier 1 — Minimum (most servers: no change)

Keep reading `body.messages`. `chat()` accepts mixed `UIMessage | ModelMessage`.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { serverTools } from './tools'

export async function POST(req: Request) {
  const body = await req.json()
  const provider = body.data?.provider // legacy mirror still works
  // prefer: body.forwardedProps?.provider

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: body.messages,
    tools: serverTools,
  })
  return toServerSentEventsResponse(stream)
}
```

### Tier 2 — Production (recommended)

Use `chatParamsFromRequest` when you need: Zod-free structural validation + 400 `Response`, `forwardedProps`, or AG-UI ids (`threadId`, `runId`, `parentRunId`).

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

Thrown 400 `Response` auto-returns in TanStack Start / SolidStart / Remix / RR7. Next.js Route Handlers, SvelteKit, Hono, Node: catch and return, or use `chatParamsFromRequestBody(await req.json())`.

### Tier 3 — Client-advertised tools (optional)

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
    tools: mergeAgentTools(serverTools, params.tools),
  })
  return toServerSentEventsResponse(stream)
}
```

**Default safe pattern:** static server `tools` array only — ignore client `params.tools`. Client tools can expand advertised surface / inject names and descriptions (prompt injection). Server tools win on name collision; client-declared tools are no-execute stubs only.

## `forwardedProps` security (Tier 2+)

Do **not** spread into `chat()`:

```ts ignore
// UNSAFE
chat({
  adapter: openaiText('gpt-5.5'),
  ...params,
  ...params.forwardedProps,
})
```

Allowlist fields:

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

Runtime `chat({ context })` is separate from AG-UI `RunAgentInput.context`. Map validated values yourself:

```ts
import { chat, chatParamsFromRequest } from '@tanstack/ai'
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

## Client

No required change. Prefer `forwardedProps` over deprecated `body`:

```ts
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

// After
useChat({
  connection: fetchServerSentEvents('/api/chat'),
  forwardedProps: { provider: 'openai', model: 'gpt-5.5' },
})
```

Svelte: `updateBody` → `updateForwardedProps` (legacy kept, deprecated).

Optional thread control:

```ts
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  threadId: 'persistent-thread-from-storage',
  connection: fetchServerSentEvents('/api/chat'),
})
```

Omit `threadId` → generated for the client instance; fresh `runId` every send. `useChat({ tools })` auto-advertises tools on the wire.

## Tool-merge semantics

- Server tools win on name collision.
- Client-only tools via `mergeAgentTools` → no-execute stubs; `ClientToolRequest` round-trips to client handler.
- Dual-handler: server executes; client `onToolCall` may fire as UI side-effect; server result is authoritative.

## Interop

**TanStack client → foreign AG-UI server:** single-turn user messages, server events, and multi-turn tool fan-out work. Client-only tools depend on the foreign server.

**Foreign AG-UI client → TanStack server:** pure `RunAgentInput` works. Tool messages → `role: 'tool'`. `reasoning` / `activity` dropped. `developer` → `system`.

## `@ag-ui/core` + zod

Depends on `@ag-ui/core@0.1.1-canary.beta.0`. zod is an optional peer — not installed transitively. `chatParamsFromRequest` / `chatParamsFromRequestBody` validate structurally (same contract, friendlier field errors). Add zod yourself if you use it for tools:

```bash
npm install zod
```

## Out of scope (unchanged)

- Reasoning replay to LLM providers still drops `ThinkingPart` at UI→Model boundary.
- AG-UI `state` / `context` surface on params as `state` / `aguiContext` (`context` deprecated alias of `aguiContext`). Map into `chat({ context })` yourself if tools need them.
