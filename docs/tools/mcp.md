---
title: MCP Server Tools
id: mcp
order: 8
description: "Connect TanStack AI to any Model Context Protocol server with createMCPClient to discover and execute its tools."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp tools
  - mcp client
  - server tools
  - createMCPClient
  - createMCPClients
  - type safety
---

`@tanstack/ai-mcp` is a host-side [Model Context Protocol](https://modelcontextprotocol.io) client for TanStack AI. It connects your server route to any MCP-compliant server and makes that server's tools, resources, and prompts available inside `chat()`.

> MCP tool execution is **server-side only**. The `createMCPClient` call lives in a server route (or serverless function) — never in browser code.

## Server MCP and WebMCP

Server MCP and WebMCP solve different problems.

| Integration | Where it runs | What it does |
|---|---|---|
| Server MCP | Your server route | Connects TanStack `chat()` to tools, resources, and prompts from an MCP server. |
| WebMCP | The browser page | Exposes executable client tools to a browser agent through `document.modelContext`. |

WebMCP calls return directly to the browser agent. They do not become tool results in a TanStack chat run.

See [WebMCP Tools](./webmcp) to expose browser actions. If your server needs MCP server tools, continue with this guide.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mcp @modelcontextprotocol/sdk
vue: @tanstack/ai-mcp @modelcontextprotocol/sdk
solid: @tanstack/ai-mcp @modelcontextprotocol/sdk
svelte: @tanstack/ai-mcp @modelcontextprotocol/sdk
preact: @tanstack/ai-mcp @modelcontextprotocol/sdk
angular: @tanstack/ai-mcp @modelcontextprotocol/sdk
vanilla: @tanstack/ai-mcp @modelcontextprotocol/sdk
octane: @tanstack/ai-mcp @modelcontextprotocol/sdk

<!-- ::end:tabs -->

## Quick Start

The simplest integration is the managed `mcp` option: hand the client to `chat()` and it discovers the tools and closes the connection when the run ends — no lifecycle code at all.

```ts ignore
// src/routes/api.chat.ts  (TanStack Start)
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        const mcp = await createMCPClient({
          transport: {
            type: 'http',
            url: 'https://my-mcp-server.example.com/mcp',
          },
        })

        // chat() discovers the tools and closes the client when the run ends.
        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          mcp: { clients: [mcp] },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

> Need fully-typed tool arguments, resources, prompts, or your own lifecycle? Spread tools manually instead — see [Manual MCP: typed tools, resources & prompts](./mcp-manual) and the [Lifecycle](#lifecycle) section below.

On the client side, consume the stream with `useChat` exactly as you would any other TanStack AI endpoint:

```tsx
// src/components/Chat.tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.role}:</strong>{' '}
          {m.parts.find((p) => p.type === 'text')?.content}
        </div>
      ))}
      <button
        onClick={() => sendMessage({ content: 'Hello' })}
        disabled={status === 'streaming'}
      >
        Send
      </button>
    </div>
  )
}
```

## Transports

### HTTP (Streamable HTTP)

The preferred transport for remote servers. Uses the MCP Streamable HTTP protocol.

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://my-mcp-server.example.com/mcp',
    headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
  },
})
```

### SSE (Server-Sent Events)

For servers that implement the legacy SSE transport.

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: {
    type: 'sse',
    url: 'https://my-mcp-server.example.com/sse',
    headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
  },
})
```

### stdio (Node.js only)

For spawning a local MCP process. Because stdio imports Node-native modules, it is isolated behind a subpath import so edge bundles stay clean.

```ts
import { stdioTransport } from '@tanstack/ai-mcp/stdio'
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: stdioTransport({
    command: 'node',
    args: ['./my-mcp-server.js'],
    env: { API_KEY: process.env.API_KEY ?? '' },
  }),
})
```

### Custom transport (escape hatch)

Pass any `Transport` instance directly as the `transport` option. For in-process testing, `InMemoryTransport` is re-exported from `@tanstack/ai-mcp`:

```ts
import { createMCPClient, InMemoryTransport } from '@tanstack/ai-mcp'

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
const mcp = await createMCPClient({ transport: clientTransport })
```

For a custom network transport, pass any SDK `Transport`-compatible instance:

```ts ignore
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const transport = new StreamableHTTPClientTransport(new URL('https://example.com/mcp'))
const mcp = await createMCPClient({ transport })
```

## Authentication

### Static tokens (headers)

For servers that take a pre-provisioned API key or bearer token, pass `headers` on the `http`/`sse` transport config — they are sent with every request:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://my-mcp-server.example.com/mcp',
    headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
  },
})
```

### OAuth (`authProvider`)

For servers implementing the [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) (OAuth 2.1), pass an `authProvider` on the `http`/`sse` transport config. It accepts any `OAuthClientProvider` from the official SDK (`@modelcontextprotocol/sdk/client/auth.js`); the SDK transport then handles attaching tokens, refreshing them, and retrying on 401 — no extra wiring in TanStack AI.

```ts ignore
import { createMCPClient } from '@tanstack/ai-mcp'
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { myTokenStore } from './token-store'

// Server-side: back the provider with tokens you persist (database, KV, ...).
// `tokens()` returning a valid (or refreshable) token set is all the SDK
// needs to authenticate requests.
const myOAuthProvider: OAuthClientProvider = myTokenStore.provider()

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://my-mcp-server.example.com/mcp',
    authProvider: myOAuthProvider,
  },
})
```

> **Interactive authorization (redirect flows).** Completing an authorization-code
> grant requires calling `finishAuth(code)` on the transport after the user is
> redirected back — and `createMCPClient` constructs the transport internally,
> so it cannot expose it. If you need the interactive flow, build the transport
> yourself and pass it in (the escape hatch above): construct a
> `StreamableHTTPClientTransport` with your `authProvider`, keep a reference,
> call `transport.finishAuth(code)` in your OAuth callback route, then hand the
> transport to `createMCPClient({ transport })`. For typical server-side use —
> a provider backed by pre-provisioned or stored tokens with working refresh —
> the config form shown above is all you need.

## Three Modes of Type Safety

### Mode 1 — Auto-discovery (`client.tools()`)

Call `tools()` with no arguments to discover every tool the server exposes. This requires no extra setup. Tool argument types are `unknown` at compile time; the MCP JSON Schema is used for runtime validation.

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
})
const tools = await mcp.tools()
// tools: ServerTool[]  — args typed unknown at compile time
```

> **Task-based tools are supported.** Tools that declare
> `execution.taskSupport: 'required'` automatically run through the MCP SDK's
> experimental `tasks/callToolStream` flow. TanStack AI waits through task
> status updates and returns the terminal result to the model. Tools declaring
> `taskSupport: 'optional'` continue to use ordinary `callTool` execution.
>
> If the chat run aborts, TanStack AI stops waiting for the task, but it does
> not cancel a remote task the server has already created.

### Mode 2 — Explicit definitions (`client.tools([...defs])`)

Pass TanStack `toolDefinition()` instances to get full TypeScript types and Zod validation. Only the named tools are returned (allowlist). `MCPToolNotFoundError` is thrown if a name isn't on the server. Task-required tools use the same automatic task execution described in Mode 1.

```ts
import { toolDefinition } from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { z } from 'zod'

const searchDef = toolDefinition({
  name: 'search',
  description: 'Search for items',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), title: z.string() })),
})

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
})
const tools = await mcp.tools([searchDef])
// tools[0].execute is typed: (args: { query: string }) => ...
```

### Mode 3 — Generated types (`createMCPClient<GeneratedServer>`)

Run the CLI against a live server to generate per-server `interface` types, then pass the generated type as a generic — tool names are narrowed to the server's literal names and pool config keys are compile-checked, with zero runtime overhead. (Tool *arguments* stay untyped on the discovery path — combine with Mode 2 for typed args.)

> See [MCP Type Generation](./mcp-codegen) for the full `mcp.config.ts` setup, the `generate` CLI, and how to wire the generated types into `createMCPClient` and `createMCPClients`.

## Tool Titles & Annotations

MCP servers can ship display and behavior metadata alongside each tool: a human-readable `title` and a set of `annotations` hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, plus a legacy `annotations.title`). `@tanstack/ai-mcp` forwards all of it onto each discovered tool's `metadata.mcp`, on **both** the auto-discovery and explicit-definition paths, so you can label tools in your UI and decide which ones need a confirmation step.

| `metadata.mcp` field | Value |
|---|---|
| `title` | `string` — display name, resolved with the spec's precedence: the tool's `title` → `annotations.title` → `name`. Always set. |
| `annotations` | The server's `annotations` object, forwarded verbatim. Absent when the server declares none. |
| `serverToolName` | `string` — server-native (unprefixed) tool name. |
| `serverId` | The client's `prefix` (undefined when there is none). |
| `uiResourceUri` | [MCP Apps](../mcp/apps) widget link, when the tool declares one. |

The block is typed, so just read it. `tools()` returns `McpServerTool`s — a plain `ServerTool` (it still drops straight into `chat({ tools })`) whose `metadata.mcp` is statically known to be present and shaped like the table above. No annotation, no cast, and a misspelled field is a compile error:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const url = 'https://my-mcp-server.example.com/mcp'

// Trust comes from YOUR configuration — an allowlist of servers you operate or
// have vetted — never from anything the server itself sends.
const trustedServers = new Set(['https://my-mcp-server.example.com/mcp'])
const serverIsTrusted = trustedServers.has(url)

const mcp = await createMCPClient({ transport: { type: 'http', url } })

const tools = (await mcp.tools()).map((tool) => {
  const meta = tool.metadata.mcp
  const advertisedReadOnly = meta.annotations?.readOnlyHint === true
  return {
    ...tool,
    // Approval is the default. A hint may only relax it for a server whose
    // trust you established independently; on any other server the same hint
    // is a label/recommendation and changes nothing about approval.
    needsApproval: !(serverIsTrusted && advertisedReadOnly),
  }
})
```

> **Annotations are advisory, never a security boundary.** The MCP spec is explicit that every field — including `title` — is a hint that may not faithfully describe what the tool actually does, and a malicious or compromised server can claim anything (`readOnlyHint: true` on a tool that deletes records). Do not use them as the security boundary for an untrusted server: never let a hint alone waive approval, sandboxing, or authorization. On a server you have independently established as trusted, a hint may *relax* a confirmation step, as above; everywhere else, treat annotations as display labels and recommendations only — surface `readOnlyHint` as a badge (see the UI example below) rather than acting on it.

Titles are display-only: they never change the tool `name` sent to the model, and a `prefix` still applies to the name (`wx_get_weather`), not to the title.

`McpToolMetadata` and `McpServerTool` are both exported if you need to name the shapes in your own signatures (`ToolAnnotations` too, re-exported from the MCP SDK). You don't need them just to read the block.

To label tools in your UI, expose the forwarded metadata from a server route — the MCP client itself must stay server-side:

```ts ignore
// src/routes/api.mcp-tools.ts
import { createFileRoute } from '@tanstack/react-router'
import { createMCPClient } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/mcp-tools')({
  server: {
    handlers: {
      GET: async () => {
        await using mcp = await createMCPClient({
          transport: { type: 'http', url: process.env.MCP_URL! },
        })
        const catalog = (await mcp.tools()).map((tool) => ({
          name: tool.name,
          // `title` is always set — the fallback chain already ran.
          title: tool.metadata.mcp.title,
          description: tool.description,
          readOnly: tool.metadata.mcp.annotations?.readOnlyHint === true,
        }))
        return Response.json({ tools: catalog })
      },
    },
  },
})
```

```tsx
// src/components/ToolCatalog.tsx
import { useEffect, useState } from 'react'

interface ToolSummary {
  name: string
  title: string
  description?: string
  readOnly: boolean
}

export function ToolCatalog() {
  const [tools, setTools] = useState<Array<ToolSummary>>([])

  useEffect(() => {
    fetch('/api/mcp-tools')
      .then((res) => res.json())
      .then((body: { tools: Array<ToolSummary> }) => setTools(body.tools))
  }, [])

  return (
    <ul>
      {tools.map((tool) => (
        <li key={tool.name}>
          {/* Server-declared title, with the hint driving the badge */}
          <strong>{tool.title}</strong> {tool.readOnly ? '(read-only)' : '(writes)'}
          <div>{tool.description}</div>
        </li>
      ))}
    </ul>
  )
}
```

## Multi-Server Pool

`createMCPClients` connects to many servers in parallel and merges their tools into one flat array. Each server's tools are automatically prefixed with the config key to prevent name collisions.

```ts
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: { transport: { type: 'http', url: process.env.LINEAR_MCP_URL! } },
})

// tools: [github_search_repos, github_create_issue, linear_create_issue, ...]
const tools = await pool.tools()
```

`pool.tools()` collects all servers' tools and throws `DuplicateToolNameError` if any two names collide after prefixing.

### Per-server access

```ts
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: { transport: { type: 'http', url: process.env.LINEAR_MCP_URL! } },
})

const linearTools = await pool.clients.linear!.tools()
const resources = await pool.clients.github!.resources()
```

### Disable or override the prefix

```ts
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: {
    transport: { type: 'http', url: process.env.GITHUB_MCP_URL! },
    prefix: 'gh',           // override: "gh_search_repos"
  },
  internal: {
    transport: { type: 'http', url: process.env.INTERNAL_MCP_URL! },
    prefix: '',             // disable prefix entirely
  },
})
```

### Closing the pool

```ts ignore
await pool.close()
// or
await using pool = await createMCPClients({ /* server configs */ })
```

If any server fails to connect, already-connected clients are closed before the error is thrown — no leaks.

## Lifecycle

> **You can skip this entire section** by passing clients to `chat()` via the `mcp` option (as in the Quick Start) — `chat()` discovers tools and closes the connections when the run ends. See [Managed MCP with `chat()`](./mcp-managed). Read on only if you spread tools manually and own `close()` yourself.

When you manage the client manually, it is **caller-owned**: `chat()` never closes it.

Tools execute **lazily while the response stream is consumed**, so only close the client after the stream is fully drained. In a route handler that returns a streaming `Response`, a `try/finally` around the `return` (or `await using` at function scope) closes the client *before* the body streams — in-flight tool calls would fail. Close in a middleware terminal hook instead.

### Streaming route handlers — close via middleware

Exactly one of `onFinish`/`onAbort`/`onError` fires per run, after the agent loop ends:

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const url = 'https://my-mcp-server.example.com/mcp'
  const mcp = await createMCPClient({ transport: { type: 'http', url } })
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    tools: await mcp.tools(),
    middleware: [
      {
        name: 'mcp-close',
        onFinish: () => mcp.close(),
        onAbort: () => mcp.close(),
        onError: () => mcp.close(),
      },
    ],
  })
  return toServerSentEventsResponse(stream)
}
```

### Manual close — when you consume the stream in scope

`try/finally` is correct when the stream is drained before the scope exits:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const url = 'https://my-mcp-server.example.com/mcp'
const mcp = await createMCPClient({ transport: { type: 'http', url } })
try {
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    tools: await mcp.tools(),
  })
  for await (const chunk of stream) {
    // handle chunks — the stream is fully consumed inside this block
  }
} finally {
  await mcp.close()
}
```

### `await using` (Explicit Resource Management)

If your runtime supports `Symbol.asyncDispose` (Node 18.2+ with TypeScript `target: "es2022"` + `lib: ["esnext"]`), the same in-scope-consumption rule applies — the client closes when the block exits:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const url = 'https://my-mcp-server.example.com/mcp'
await using mcp = await createMCPClient({ transport: { type: 'http', url } })
const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  tools: await mcp.tools(),
})
for await (const chunk of stream) {
  // handle chunks
}
// mcp.close() is called automatically when the block exits
```

## Tool Name Collisions

When mixing tools from multiple sources, duplicate names throw `DuplicateToolNameError`:

```ts
import { createMCPClients, DuplicateToolNameError } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: { transport: { type: 'http', url: process.env.LINEAR_MCP_URL! } },
})

try {
  const tools = await pool.tools()
} catch (err) {
  if (err instanceof DuplicateToolNameError) {
    console.error('Conflicting tool name:', err.toolName)
    // Fix: set a unique prefix on one of the clients
  }
}
```

Use a unique `prefix` on each client to avoid collisions — `createMCPClients` does this automatically using the config key.

## Lazy Tool Discovery

Pass `{ lazy: true }` to defer sending tool schemas to the LLM until it explicitly asks for them. This reduces token usage when working with tool-heavy servers.

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
})
const tools = await mcp.tools({ lazy: true })
// All tools are marked lazy: true
```

Works with the pool too:

```ts
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: { transport: { type: 'http', url: process.env.LINEAR_MCP_URL! } },
})
const tools = await pool.tools({ lazy: true })
```

See [Lazy Tool Discovery](./lazy-tool-discovery) for how the LLM discovers lazy tools at runtime.

## Using MCP with `chat()`

The Quick Start above hands tools to `chat()` manually via `tools: await mcp.tools()` and closes the client yourself. Two follow-on guides cover richer integrations:

> **Let `chat()` own discovery and lifecycle.** Pass live clients and pools to `chat()` via the `mcp` option and it discovers tools and closes connections for you — no `try/finally` per route. See [Managed MCP with `chat()`](./mcp-managed).

> **Resources, prompts, and fully-typed manual tools.** Inject MCP resources and prompts into a `chat()` run, cancel in-flight MCP calls, and spread `toolDefinition`-typed tools. See [Manual MCP: typed tools, resources & prompts](./mcp-manual).

## Error Reference

| Error class | When thrown |
|---|---|
| `MCPConnectionError` | `createMCPClient` fails to connect, or a method is called after `close()` |
| `DuplicateToolNameError` | Two tools have the same name within one client or across the pool |
| `MCPToolNotFoundError` | A `toolDefinition` name passed to `tools([...defs])` is not found on the server |
| `MCPTaskRequiredToolError` | Deprecated compatibility export. Task-required tools are now supported and this error is no longer thrown by `tools()` |

For the `MCPDuplicateToolNameError` thrown when merging tools from multiple sources inside a `chat({ mcp })` run, see [Managed MCP with `chat()`](./mcp-managed#tool-name-collisions).
