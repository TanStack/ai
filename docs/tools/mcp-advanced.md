---
title: "MCP Server Tools: Advanced"
id: mcp-advanced
order: 13
description: "Every option of the TanStack AI MCP client: OAuth, custom transports, timeouts, type safety, tool annotations, tool filters, pools, lifecycle, tool names, lazy discovery, and errors."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp client
  - createMCPClient
  - createMCPClients
  - toolFilter
  - needsApproval
  - oauth
---

This page is the reference for `createMCPClient` and `createMCPClients`. To connect your first server, start at [MCP Server Tools](./mcp).

## Authentication

### Static tokens (headers)

If the server takes an API key or a bearer token, pass `headers` on the `http` or `sse` transport. The client sends them with each request:

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

If the server uses the [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) (OAuth 2.1), pass an `authProvider` on the `http` or `sse` transport. The value is an `OAuthClientProvider` from `@modelcontextprotocol/client`.

The transport does these steps for you:

- It attaches the token.
- It refreshes the token.
- It sends the request again on a 401.

```ts ignore
import { createMCPClient } from '@tanstack/ai-mcp'
import type { OAuthClientProvider } from '@modelcontextprotocol/client'
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

For a provider with stored tokens and a working refresh, this form is all you need.

An interactive redirect flow needs one more step. After the redirect, you must call `finishAuth(code)` on the transport. `createMCPClient` makes the transport internally, so you cannot reach it. Make the transport yourself instead:

1. Make a `StreamableHTTPClientTransport` with your `authProvider`, and keep a reference to it.
2. In your OAuth callback route, call `transport.finishAuth(code)`.
3. Pass the transport to `createMCPClient({ transport })`. See [Custom transport](#custom-transport).

## Custom transport

You can pass any `Transport` instance as the `transport` option. For tests in the same process, `@tanstack/ai-mcp` exports `InMemoryTransport`:

```ts
import { createMCPClient, InMemoryTransport } from '@tanstack/ai-mcp'

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
const mcp = await createMCPClient({ transport: clientTransport })
```

For a custom network transport, pass a `Transport` from `@modelcontextprotocol/client`:

```ts ignore
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const transport = new StreamableHTTPClientTransport(new URL('https://example.com/mcp'))
const mcp = await createMCPClient({ transport })
```

## Timeouts

By default, each request waits up to 60 seconds, then fails. A long tool, such as a report or a build, fails at that limit too.

Set `requestOptions` to change the limit. It applies to the connect handshake, tool lists, tool calls, resource requests, and prompt requests:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
  requestOptions: {
    // Wait up to 2 minutes for each request.
    timeout: 120_000,
    // Start the 2 minutes again each time the server reports progress.
    resetTimeoutOnProgress: true,
  },
})
```

- `timeout`: the limit in milliseconds. The SDK default is 60,000.
- `resetTimeoutOnProgress`: start the timeout again when the server sends a progress notification. A tool call on protocol `2026-07-28` gets no progress notifications, so only `timeout` applies there.

Edge cases:

- On a `stdio` server, connect can take up to two times `timeout`. When the version check runs out of time, the SDK tries the older handshake with its own `timeout`.
- The `subscriptions/listen` stream and task status polls keep the SDK defaults.
- A request that runs out of time throws an `SdkError` from `@modelcontextprotocol/client`, with the code `SdkErrorCode.RequestTimeout`.

Each server in a [pool](#multi-server-pool) can have its own `requestOptions`. [MCP Apps](../mcp/apps) widget calls use the options of the same client.

## Three Modes of Type Safety

### Mode 1: auto-discovery

Call `tools()` with no arguments to get every tool of the server. This needs no setup. The tool arguments have the type `unknown` at compile time. The client uses the MCP JSON Schema to check them at runtime.

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
})
const tools = await mcp.tools()
// tools: ServerTool[]  (args typed unknown at compile time)
```

Some providers reject an object schema without `properties`. To keep those tools working, the client adds defaults:

- A schema without `properties` gets `properties: {}`.
- A schema without `type` gets `type: 'object'`.
- A schema that has both fields does not change.

MCP schemas often use `$ref` or `oneOf`. On adapters built on the OpenAI API, those tools go out without strict mode, and the adapter warns in development. See [Tools that cannot use strict mode](../adapters/openai-advanced.md#tools-that-cannot-use-strict-mode).

Task-based tools work too:

- A tool with `execution.taskSupport: 'required'` runs through the experimental `tasks/callToolStream` flow of the MCP SDK. TanStack AI waits through the task status updates and gives the final result to the model.
- A tool with `taskSupport: 'optional'` uses a normal `callTool`.
- Task execution needs the server to declare the tasks capability for `tools/call`. If the server lists a task-required tool without it, auto-discovery skips the tool, because nothing can call it.
- If the chat run aborts, TanStack AI stops the wait and sends a best-effort `tasks/cancel` for a remote task that the server already made.

### Mode 2: explicit definitions

Pass TanStack `toolDefinition()` instances to get full TypeScript types and Zod validation. You get only the named tools back. If a name is not on the server, `tools()` throws `MCPToolNotFoundError`. Task-required tools use the same task execution as Mode 1.

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

### Mode 3: generated types

Run the CLI against a live server to generate an `interface` for each server. Then pass the type as a generic to `createMCPClient`. You get:

- Tool names narrowed to the literal names of the server.
- Compile-checked config keys on a pool.
- No runtime cost.

Tool arguments stay `unknown` on this path. For typed arguments, use Mode 2 too.

See [MCP Type Generation](./mcp-codegen) for the `mcp.config.ts` setup, the `generate` CLI, and how to use the types.

## Tool Titles & Annotations

An MCP server can send display and behavior data with each tool:

- `title`: a name for people to read.
- `annotations`: hints such as `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, and an older `annotations.title`.

`@tanstack/ai-mcp` puts this data on `metadata.mcp` of each tool. It does this in Mode 1 and in Mode 2. Use it to label tools in your UI and to pick which tools need a confirmation step.

| `metadata.mcp` field | Value |
|---|---|
| `title` | `string`. The display name, in this order of precedence: the `title` of the tool, then `annotations.title`, then `name`. Always set. |
| `annotations` | A frozen copy of the `annotations` object of the server. Not set when the server sends none. To change a value, copy it first: `{ ...tool.metadata.mcp.annotations, readOnlyHint: false }`. |
| `serverToolName` | `string`. The tool name on the server, without a prefix. |
| `serverId` | The `prefix` of the client. `undefined` when there is no prefix. |
| `uiResourceUri` | The [MCP Apps](../mcp/apps) widget link, when the tool declares one. |

`tools()` returns `McpServerTool` items. Each one is a normal `ServerTool`, so it goes into `chat({ tools })` as is. Its `metadata.mcp` has a static type, so you can read it with no cast. A misspelled field is a compile error:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const url = 'https://my-mcp-server.example.com/mcp'

// Trust comes from YOUR configuration (an allowlist of servers that you run
// or checked), never from anything that the server sends.
const trustedServers = new Set(['https://my-mcp-server.example.com/mcp'])
const serverIsTrusted = trustedServers.has(url)

const mcp = await createMCPClient({ transport: { type: 'http', url } })

const tools = (await mcp.tools()).map((tool) => {
  const meta = tool.metadata.mcp
  const advertisedReadOnly = meta.annotations?.readOnlyHint === true
  return {
    ...tool,
    // Approval is the default. A hint can relax it only on a server that
    // you trust for other reasons. On any other server, the hint is only
    // a label, and it does not change approval.
    needsApproval: !(serverIsTrusted && advertisedReadOnly),
  }
})
```

> [!WARNING]
> Do not use annotations as a security boundary. Every field, `title` too, is a hint from the server. A bad server can mark a tool that deletes records with `readOnlyHint: true`.
>
> - On a server that you do not trust, a hint must never skip approval, sandboxing, or authorization. Show it as a label only.
> - On a server that you trust for other reasons, a hint can relax a confirmation step, as in the sample above.

Titles are for display only:

- A title never changes the tool `name` that the model gets.
- A `prefix` applies to the name (`wx_get_weather`), not to the title.

`McpToolMetadata`, `McpServerTool`, and `ToolAnnotations` (from the MCP SDK) are exported. Use them to name the types in your own signatures. You do not need them to read the data.

To label tools in your UI, send the data from a server route. The MCP client must stay on the server:

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
          // `title` is always set. The fallback order already ran.
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

## Limit and Gate Tools

By default, the model gets every tool that the server lists, and each tool runs without approval. A server can expose tools that write or delete data. Two client options control this:

- `toolFilter`: a function that returns `false` to hide a tool, or a list of the tool names to keep.
- `needsApproval`: return `true` to pause the run for [approval](./tool-approval) before each call to the tool.

Both options are off by default. A `toolFilter` function and `needsApproval` get the tool definition from the server. It has the server `name` (without a prefix), the `title`, and the `annotations`.

Send only the tools that the server marks read-only:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
  toolFilter: (tool) => tool.annotations?.readOnlyHint === true,
})

const tools = await mcp.tools() // only read-only tools
```

A tool with no `annotations` does not pass this filter.

On a server that you do not trust, list the tools by name. You control the names, and the server controls the hints:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
  toolFilter: ['search_issues', 'get_issue'],
})

const tools = await mcp.tools() // search_issues, then get_issue
```

A list is strict:

- The tools come back in the list order.
- A name that the server does not have, or a name listed twice, throws `MCPToolFilterError`. Its `missing`, `repeated`, and `available` fields name the tools. A typo fails the `tools()` call, so the model never runs with fewer tools than you expect.
- A listed tool that needs task execution, on a server without task support, throws `MCPTaskRequiredToolError`.
- An empty list keeps no tools.

A function does not fail when a tool is missing. If the tool list of the server can change, use a function.

Keep every tool, but ask the user before a tool runs:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const url = 'https://my-mcp-server.example.com/mcp'
// Trust comes from your configuration, not from the server.
const trustedServers = new Set(['https://my-mcp-server.example.com/mcp'])
const serverIsTrusted = trustedServers.has(url)

const mcp = await createMCPClient({
  transport: { type: 'http', url },
  // A read-only hint skips approval only on a server that you trust.
  needsApproval: (tool) =>
    !(serverIsTrusted && tool.annotations?.readOnlyHint === true),
})
```

The run stops with an approval interrupt for each gated call. The client approves or denies it the same way as for any other tool. See [Tool Approval Flow](./tool-approval).

In a [pool](#multi-server-pool), each server gets its own options:

```ts
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: {
    transport: { type: 'http', url: process.env.GITHUB_MCP_URL! },
    toolFilter: (tool) => tool.annotations?.readOnlyHint === true,
  },
  docs: { transport: { type: 'http', url: process.env.DOCS_MCP_URL! } },
})
```

Where the options apply:

| Call | `toolFilter` | `needsApproval` |
|---|---|---|
| `tools()` | Hides tools. | Marks tools. |
| `tools([...defs])` | Applies. A definition that the filter hides throws `MCPToolNotFoundError`. | Does not apply. Each `toolDefinition` has its own `needsApproval`. |
| `chat({ mcp })` | Applies, because `chat()` calls `tools()`. See [Managed MCP](./mcp-managed). | Applies. |
| [MCP Apps](../mcp/apps) widget calls | Applies. A widget cannot call a hidden tool. | Applies. A widget call has no approval step, so a call to a marked tool returns `{ ok: false }`. |
| `callTool()` | Does not apply. Your code calls the tool, not the model. | Does not apply. |

> [!WARNING]
> The hints come from the server. A compromised server can mark a delete tool `readOnlyHint: true`. For a server that you do not trust, use a name list or `needsApproval`.

If you need to name the type of the `tool` argument, use the exported `McpTool` type.

## Multi-Server Pool

`createMCPClients` connects to many servers at the same time and merges their tools into one flat array. Each tool name gets the config key as a prefix, so names from two servers do not collide.

```ts
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: { transport: { type: 'http', url: process.env.LINEAR_MCP_URL! } },
})

// tools: [github_search_repos, github_create_issue, linear_create_issue, ...]
const tools = await pool.tools()
```

`pool.tools()` collects the tools of all servers. If two names are the same after the prefix, it throws `DuplicateToolNameError`.

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

If one server fails to connect, the pool closes the clients that did connect, then throws. No connection stays open.

## Lifecycle

> [!TIP]
> If you pass clients to `chat()` in the `mcp` option, you can skip this section. `chat()` closes the connections when the run ends. See [Managed MCP with chat()](./mcp-managed).

When you spread tools into `tools` yourself, you own the client. `chat()` never closes it.

Tools run while the response stream is read. So close the client only after the stream is fully read.

In a route that returns a streaming `Response`, a `try/finally` around the `return` closes the client too early. The same is true for `await using` at function scope. The client closes before the body streams, and tool calls in progress fail. Close it in a middleware hook instead.

### Streaming route handlers: close via middleware

After the agent loop ends, exactly one of `onFinish`, `onAbort`, or `onError` runs:

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const { messages, threadId } = await request.json()
  const url = 'https://my-mcp-server.example.com/mcp'
  const mcp = await createMCPClient({ transport: { type: 'http', url } })
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
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

### Manual close: when you read the stream in scope

`try/finally` is correct when you read the full stream before the scope ends:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const url = 'https://my-mcp-server.example.com/mcp'
const mcp = await createMCPClient({ transport: { type: 'http', url } })
try {
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId: 'thread-1',
    tools: await mcp.tools(),
  })
  for await (const chunk of stream) {
    // handle chunks: the stream is fully read inside this block
  }
} finally {
  await mcp.close()
}
```

### `await using` (Explicit Resource Management)

This needs a runtime with `Symbol.asyncDispose`: Node 18.2+ with TypeScript `target: "es2022"` and `lib: ["esnext"]`. The same rule applies: read the stream in scope. The client closes when the block ends:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const url = 'https://my-mcp-server.example.com/mcp'
await using mcp = await createMCPClient({ transport: { type: 'http', url } })
const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  tools: await mcp.tools(),
})
for await (const chunk of stream) {
  // handle chunks
}
// mcp.close() is called automatically when the block exits
```

## Tool Name Collisions

When you mix tools from many sources, two tools with the same name throw `DuplicateToolNameError`:

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

To prevent a collision, give each client a unique `prefix`. `createMCPClients` does this for you with the config key.

## Name Tools Yourself

The model gets `<prefix>_<tool>`, or the server tool name when there is no prefix. Some apps need another pattern. For example:

- A fixed `mcp__<server>__<tool>` form.
- Names without characters that a provider rejects.

Pass `toolName`. It gets the tool definition from the server and returns the name that the model gets. It wins over `prefix`:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

// Keep only letters, digits, `_`, and `-` in the name.
const clean = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_')

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
  toolName: (tool) => `mcp__github__${clean(tool.name)}`,
})

const tools = await mcp.tools() // mcp__github__search_issues, ...
```

- The name applies to `tools()` and to `tools([...defs])`.
- `metadata.mcp.serverToolName` keeps the server name of the tool. [MCP Apps](../mcp/apps) widget calls use it, and `callTool()` takes it, so both still reach the tool.
- `metadata.mcp.serverId` is still the client `prefix`.
- MCP Apps routes widget calls by `prefix`. If you use MCP Apps with `toolName`, keep a `prefix` on each client.
- Two tools with the same final name throw `DuplicateToolNameError`, in one client and across a pool.

In a pool, each server gets its own `toolName`:

```ts
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: {
    transport: { type: 'http', url: process.env.GITHUB_MCP_URL! },
    toolName: (tool) => `mcp__github__${tool.name}`,
  },
  linear: {
    transport: { type: 'http', url: process.env.LINEAR_MCP_URL! },
    toolName: (tool) => `mcp__linear__${tool.name}`,
  },
})

const tools = await pool.tools() // mcp__github__..., mcp__linear__...
```

## Lazy Tool Discovery

A server with many tools sends many schemas to the model, and each schema costs tokens. Pass `{ lazy: true }` to send a schema only when the model asks for it:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
})
const tools = await mcp.tools({ lazy: true })
// All tools are marked lazy: true
```

It works on a pool too:

```ts
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: { transport: { type: 'http', url: process.env.LINEAR_MCP_URL! } },
})
const tools = await pool.tools({ lazy: true })
```

See [Lazy Tool Discovery](./lazy-tool-discovery) for how the model finds lazy tools at runtime.

## Error Reference

| Error class | When thrown |
|---|---|
| `MCPConnectionError` | `createMCPClient` cannot connect, or you call a method after `close()`. |
| `DuplicateToolNameError` | Two tools have the same name in one client or across the pool. |
| `MCPToolNotFoundError` | A `toolDefinition` name passed to `tools([...defs])` is not on the server, or the `toolFilter` of the client hides it. |
| `MCPToolFilterError` | A `toolFilter` list names a tool that the server does not have, or names a tool twice. In a pool, `pool.tools()` throws `MCPConnectionError` with this error as its `cause`. |
| `MCPTaskRequiredToolError` | A task-required tool came from `tools([...defs])`, a `toolFilter` list, or `callTool()`, but the server does not declare the tasks capability for `tools/call`. The call can never run. |

For the `MCPDuplicateToolNameError` that a `chat({ mcp })` run throws when it merges tools from many sources, see [Managed MCP with chat()](./mcp-managed#tool-name-collisions).
