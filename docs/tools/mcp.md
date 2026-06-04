---
title: MCP Server Tools
id: mcp
order: 8
description: "Connect TanStack AI to any Model Context Protocol server to discover and execute its tools, resources, and prompts inside chat()."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp tools
  - mcp client
  - server tools
  - createMCPClient
  - createMCPClients
  - codegen
  - type safety
---

`@tanstack/ai-mcp` is a host-side [Model Context Protocol](https://modelcontextprotocol.io) client for TanStack AI. It connects your server route to any MCP-compliant server and makes that server's tools, resources, and prompts available inside `chat()`.

> MCP tool execution is **server-side only**. The `createMCPClient` call lives in a server route (or serverless function) — never in browser code.

## Installation

```bash
pnpm add @tanstack/ai-mcp @modelcontextprotocol/sdk
```

## Quick Start

```ts
// app/api/chat/route.ts  (Next.js App Router example)
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const mcp = await createMCPClient({
    transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
  })

  try {
    const stream = chat({
      adapter: openaiText(),
      model: 'gpt-4o',
      messages,
      tools: await mcp.tools(),
    })

    return toServerSentEventsResponse(stream)
  } finally {
    await mcp.close()
  }
}
```

On the client side, consume the stream with `useChat` exactly as you would any other TanStack AI endpoint:

```tsx
// components/Chat.tsx
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
          <strong>{m.role}:</strong> {m.content}
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

Pass any `Transport` instance from `@modelcontextprotocol/sdk` directly:

```ts
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const transport = new StreamableHTTPClientTransport(new URL('https://example.com/mcp'))
const mcp = await createMCPClient({ transport })
```

## Three Modes of Type Safety

### Mode 1 — Auto-discovery (`client.tools()`)

Call `tools()` with no arguments to discover every tool the server exposes. This requires no extra setup. Tool argument types are `unknown` at compile time; the MCP JSON Schema is used for runtime validation.

```ts
const tools = await mcp.tools()
// tools: ServerTool[]  — args typed unknown at compile time
```

### Mode 2 — Explicit definitions (`client.tools([...defs])`)

Pass TanStack `toolDefinition()` instances to get full TypeScript types and Zod validation. Only the named tools are returned (allowlist). `MCPToolNotFoundError` is thrown if a name isn't on the server.

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const searchDef = toolDefinition({
  name: 'search',
  description: 'Search for items',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), title: z.string() })),
})

const tools = await mcp.tools([searchDef])
// tools[0].execute is typed: (args: { query: string }) => ...
```

### Mode 3 — Generated types (`createMCPClient<GeneratedServer>`)

Run the CLI against a live server to generate per-server `interface` types. Pass the generated type as a generic to get end-to-end type safety with zero runtime overhead.

```ts
// mcp-types.generated.ts — produced by `npx @tanstack/ai-mcp generate`
import type { GithubServer } from './mcp-types.generated'
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient<GithubServer>({
  transport: { type: 'http', url: process.env.GITHUB_MCP_URL! },
})

const tools = await mcp.tools()
// Each tool's name is now a literal type from GithubServer['tools']
```

See [Code Generation](#code-generation) below for CLI setup.

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
const linearTools = await pool.clients.linear.tools()
const resources = await pool.clients.github.resources()
```

### Disable or override the prefix

```ts
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

```ts
await pool.close()
// or
await using pool = await createMCPClients({ ... })
```

If any server fails to connect, already-connected clients are closed before the error is thrown — no leaks.

## Lifecycle

The MCP client is **caller-owned**. `chat()` never closes it.

> **Prefer to let `chat()` manage lifecycle?** If you'd rather skip the `try/finally` and have `chat()` discover tools and close clients automatically, see [Managing MCP clients with `chat()`](#managing-mcp-clients-with-chat).

### Manual close

```ts
const mcp = await createMCPClient({ transport: { type: 'http', url } })
try {
  const stream = chat({ ..., tools: await mcp.tools() })
  return toServerSentEventsResponse(stream)
} finally {
  await mcp.close()
}
```

### `await using` (Explicit Resource Management)

If your runtime supports `Symbol.asyncDispose` (Node 18.2+ with TypeScript `target: "es2022"` + `lib: ["esnext"]`):

```ts
await using mcp = await createMCPClient({ transport: { type: 'http', url } })
// mcp.close() is called automatically when the block exits
const stream = chat({ ..., tools: await mcp.tools() })
return toServerSentEventsResponse(stream)
```

## Managing MCP clients with `chat()`

You have one or more live MCP clients (or pools) and you want the model to use their tools — without writing boilerplate `await client.tools()` calls and `try/finally close()` blocks for every route. Pass them to `chat()` via the `mcp` option and it handles both discovery and lifecycle for you.

> **When to use `mcp` vs the `tools` spread**
>
> - Use `mcp: { clients: [...] }` when you want **discovery + lifecycle** managed for you and you are happy with runtime-typed (`unknown`-argument) tools.
> - Use `tools: [...await client.tools([toolDefinition(...)])]` when you need **fully-typed MCP tools** — the defs overload gives you Zod-validated, TypeScript-typed arguments. See [Three Modes of Type Safety](#three-modes-of-type-safety).
>
> Both coexist in the same `chat()` call. Tools from `mcp.clients` are merged with any tools you pass explicitly via `tools`.

### Hand a client to `chat()`

The simplest path: create a client, hand it to `chat()`, and let the run clean it up. `connection` defaults to `'close'`, so the client is closed automatically once the run ends — on success, error, or abort.

```ts
// app/api/chat/route.ts  (Next.js App Router)
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const body = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray(body.messages)
  ) {
    return new Response('Bad request', { status: 400 })
  }

  const mcpClient = await createMCPClient({
    transport: {
      type: 'http',
      url: process.env.MCP_URL!,
      headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
    },
  })

  // chat() discovers mcpClient's tools and closes the connection when done.
  // No try/finally needed.
  const stream = chat({
    adapter: openaiText(),
    model: 'gpt-4o',
    messages: body.messages,
    mcp: {
      clients: [mcpClient],
      // connection: 'close' is the default — shown here for clarity
      connection: 'close',
    },
  })

  return toServerSentEventsResponse(stream)
}
```

### Multiple servers and pools

Pass any mix of `MCPClient` instances and `MCPClients` pools. Their tools are discovered in parallel and merged into one flat tool set. Pools auto-prefix each server's tools with the config key to prevent name collisions.

```ts
// app/api/chat/route.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient, createMCPClients } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const body = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray(body.messages)
  ) {
    return new Response('Bad request', { status: 400 })
  }

  // A pool of two servers — their tools are prefixed "github_" and "linear_"
  const githubLinearPool = await createMCPClients({
    github: {
      transport: {
        type: 'http',
        url: process.env.GITHUB_MCP_URL!,
        headers: { Authorization: `Bearer ${process.env.GITHUB_MCP_TOKEN}` },
      },
    },
    linear: {
      transport: {
        type: 'http',
        url: process.env.LINEAR_MCP_URL!,
        headers: { Authorization: `Bearer ${process.env.LINEAR_MCP_TOKEN}` },
      },
    },
  })

  // A standalone client for an internal server
  const internalClient = await createMCPClient({
    transport: { type: 'http', url: process.env.INTERNAL_MCP_URL! },
  })

  // All three servers' tools are merged: github_*, linear_*, plus internal tools
  const stream = chat({
    adapter: openaiText(),
    model: 'gpt-4o',
    messages: body.messages,
    mcp: {
      clients: [githubLinearPool, internalClient],
      connection: 'close',
    },
  })

  return toServerSentEventsResponse(stream)
}
```

### Keep connections warm

Creating a new MCP connection on every request adds latency. For production routes with high request rates, create your pool once at module level and pass `connection: 'keep-alive'` so `chat()` never closes it. The pool stays ready for the next request.

**Server route (`app/api/chat/route.ts`):**

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClients } from '@tanstack/ai-mcp'

// Created once when the module loads. Shared across all requests.
const sharedPool = await createMCPClients({
  github: {
    transport: {
      type: 'http',
      url: process.env.GITHUB_MCP_URL!,
      headers: { Authorization: `Bearer ${process.env.GITHUB_MCP_TOKEN}` },
    },
  },
  linear: {
    transport: {
      type: 'http',
      url: process.env.LINEAR_MCP_URL!,
      headers: { Authorization: `Bearer ${process.env.LINEAR_MCP_TOKEN}` },
    },
  },
})

export async function POST(request: Request) {
  const body = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray(body.messages)
  ) {
    return new Response('Bad request', { status: 400 })
  }

  // keep-alive: sharedPool is never closed by chat(); stays warm for next call
  const stream = chat({
    adapter: openaiText(),
    model: 'gpt-4o',
    messages: body.messages,
    mcp: {
      clients: [sharedPool],
      connection: 'keep-alive',
    },
  })

  return toServerSentEventsResponse(stream)
}
```

**Client component (`components/Chat.tsx`):**

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

export function Chat() {
  const { messages, sendMessage, status } = useChat(chatOptions)

  return (
    <div>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <strong>{m.role}:</strong> {m.content}
          </li>
        ))}
      </ul>
      <button
        onClick={() => sendMessage({ content: 'List my open GitHub issues' })}
        disabled={status === 'streaming'}
      >
        Ask
      </button>
    </div>
  )
}
```

### Lazy tool discovery

When your MCP server exposes dozens of tools, sending every schema to the model inflates prompt size and cost. Set `lazyTools: true` to defer sending tool schemas until the model explicitly requests them.

```ts
// app/api/chat/route.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const body = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray(body.messages)
  ) {
    return new Response('Bad request', { status: 400 })
  }

  const mcpClient = await createMCPClient({
    transport: { type: 'http', url: process.env.LARGE_MCP_URL! },
  })

  const stream = chat({
    adapter: openaiText(),
    model: 'gpt-4o',
    messages: body.messages,
    mcp: {
      clients: [mcpClient],
      connection: 'close',
      // Tools are registered but schemas are withheld until the model asks
      lazyTools: true,
    },
  })

  return toServerSentEventsResponse(stream)
}
```

`lazyTools: true` is forwarded to each source's `tools({ lazy: true })` call. See [Lazy Tool Discovery](./lazy-tool-discovery) for how the model discovers and loads lazy tools at runtime.

### Handling discovery failures

By default, if any source fails during discovery, `chat()` throws immediately (fail-fast). When `connection: 'close'`, any sources that did connect are cleaned up before the error propagates — no leaked connections.

**Fail-fast (default):**

```ts
// app/api/chat/route.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const body = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray(body.messages)
  ) {
    return new Response('Bad request', { status: 400 })
  }

  const mcpClient = await createMCPClient({
    transport: { type: 'http', url: process.env.MCP_URL! },
  })

  // If discovery fails, chat() throws before the first model call.
  // mcpClient is closed automatically (connection: 'close' default).
  const stream = chat({
    adapter: openaiText(),
    model: 'gpt-4o',
    messages: body.messages,
    mcp: {
      clients: [mcpClient],
    },
  })

  return toServerSentEventsResponse(stream)
}
```

**Skip a flaky server and proceed:**

Use `onDiscoveryError` to log the problem and return normally — the failing source is skipped and the run continues with the remaining clients' tools.

```ts
// app/api/chat/route.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const body = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray(body.messages)
  ) {
    return new Response('Bad request', { status: 400 })
  }

  const primaryClient = await createMCPClient({
    transport: { type: 'http', url: process.env.PRIMARY_MCP_URL! },
  })

  const optionalClient = await createMCPClient({
    transport: { type: 'http', url: process.env.OPTIONAL_MCP_URL! },
  })

  const stream = chat({
    adapter: openaiText(),
    model: 'gpt-4o',
    messages: body.messages,
    mcp: {
      clients: [primaryClient, optionalClient],
      connection: 'close',
      onDiscoveryError(error, source) {
        // Log the failure but let the run proceed without this source's tools.
        // Throw here (or re-throw `error`) to fail the whole run instead.
        console.warn('MCP discovery failed for a source, skipping.', error)
      },
    },
  })

  return toServerSentEventsResponse(stream)
}
```

> Sources passed to `onDiscoveryError` may have already connected before discovery failed. When `connection: 'close'`, they are still closed at the end of the run — even if their tools were skipped.

### Tool-name collisions

If two sources expose a tool with the same name, `chat()` throws a `DuplicateToolNameError` after merging the discovered tools. Fix it by assigning a `prefix` to one of the clients, or by using `createMCPClients` (which auto-prefixes using the config key).

```ts
// app/api/chat/route.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const body = await request.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray(body.messages)
  ) {
    return new Response('Bad request', { status: 400 })
  }

  // Both servers expose a tool called "search". Without prefixes this would
  // throw DuplicateToolNameError. The prefix option resolves the clash.
  const serverA = await createMCPClient({
    transport: { type: 'http', url: process.env.SERVER_A_URL! },
    prefix: 'alpha',   // tools become "alpha_search", etc.
  })

  const serverB = await createMCPClient({
    transport: { type: 'http', url: process.env.SERVER_B_URL! },
    prefix: 'beta',    // tools become "beta_search", etc.
  })

  const stream = chat({
    adapter: openaiText(),
    model: 'gpt-4o',
    messages: body.messages,
    mcp: {
      clients: [serverA, serverB],
      connection: 'close',
    },
  })

  return toServerSentEventsResponse(stream)
}
```

See [Tool Name Collisions](#tool-name-collisions) and [Disable or override the prefix](#disable-or-override-the-prefix) for more details.

## Tool Name Collisions

When mixing tools from multiple sources, duplicate names throw `DuplicateToolNameError`:

```ts
import { DuplicateToolNameError } from '@tanstack/ai-mcp'

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
const tools = await mcp.tools({ lazy: true })
// All tools are marked lazy: true
```

Works with the pool too:

```ts
const tools = await pool.tools({ lazy: true })
```

See [Lazy Tool Discovery](./lazy-tool-discovery) for how the LLM discovers lazy tools at runtime.

## Resources

MCP resources are context documents (files, database records, web pages) the server exposes. Fetch them and inject them into `chat()` as content parts.

```ts
import { mcpResourceToContentPart } from '@tanstack/ai-mcp'

const resources = await mcp.resources()
// resources: Array<{ uri: string; name: string; ... }>

const readResult = await mcp.readResource(resources[0].uri)
const parts = readResult.contents.map(mcpResourceToContentPart)

// Inject as part of a user message
const stream = chat({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages: [
    {
      role: 'user',
      content: [
        ...parts,
        { type: 'text', content: 'Summarize the above document.' },
      ],
    },
  ],
})
```

`mcpResourceToContentPart` maps each MCP content block to a `ContentPart`:
- `text` field present → `{ type: 'text', content: text }`
- `blob` field present → `{ type: 'text', content: '[binary resource <uri>]' }`
- otherwise → `{ type: 'text', content: JSON.stringify(content) }`

### Resource templates

```ts
const templates = await mcp.resourceTemplates()
// templates: Array<ResourceTemplate>
```

## Prompts

MCP prompts are reusable message templates the server exposes. Fetch a prompt, convert it to `ModelMessage[]` with `mcpPromptToMessages`, and spread it into `chat()` to seed the conversation with server-defined context or instructions.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient, mcpPromptToMessages } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const mcp = await createMCPClient({
    transport: { type: 'http', url: process.env.MCP_URL! },
  })

  try {
    // List all available prompts on the server
    const available = await mcp.prompts()
    // available: Array<{ name: string; description?: string; arguments?: ... }>

    // Fetch a specific prompt, optionally passing template arguments
    const prompt = await mcp.getPrompt('summarize', { language: 'english' })

    const stream = chat({
      adapter: openaiText(),
      model: 'gpt-4o',
      messages: [
        // Seed the conversation with the server-defined prompt messages
        ...mcpPromptToMessages(prompt),
        // Then append the user's own messages
        ...messages,
      ],
    })

    return toServerSentEventsResponse(stream)
  } finally {
    await mcp.close()
  }
}
```

`mcpPromptToMessages` maps each MCP prompt message to a `ModelMessage`:
- `role === 'assistant'` → `{ role: 'assistant', content: text }`
- any other role → `{ role: 'user', content: text }`
- non-text content → `content` is `JSON.stringify`'d

`getPrompt(name, args?)` accepts an optional `args` parameter typed as `Record<string, string>` for filling in template variables declared by the prompt.

## Cancellation

When the chat run is cancelled (e.g. the user navigates away or an `AbortController` fires), in-flight MCP `callTool` requests are cancelled automatically. The abort signal from the chat run is threaded through `ToolExecutionContext.abortSignal` into each tool's execute function.

```ts
const controller = new AbortController()

const stream = chat({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages,
  tools: await mcp.tools(),
  abortController: controller,
})

// Cancel the run and all in-flight MCP tool calls:
controller.abort()
```

## Code Generation

The `generate` CLI introspects a live MCP server and emits TypeScript interface types for [Mode 3](#mode-3--generated-types-createmcpclientgeneratedserver) type safety.

### 1. Create `mcp.config.ts`

```ts
// mcp.config.ts
import { defineConfig } from '@tanstack/ai-mcp'

export default defineConfig({
  servers: {
    github: {
      transport: { type: 'http', url: 'https://github-mcp.example.com/mcp' },
    },
    linear: {
      transport: { type: 'http', url: 'https://linear-mcp.example.com/mcp' },
      prefix: 'linear', // must match runtime createMCPClient({ prefix })
    },
  },
  outFile: './mcp-types.generated.ts',
})
```

### 2. Run the generator

```bash
npx @tanstack/ai-mcp generate
```

### 3. Inspect the output

The generator emits one interface per server plus a combined pool map:

```ts
// mcp-types.generated.ts — AUTO-GENERATED, do not edit

import type { ServerDescriptor } from '@tanstack/ai-mcp'

export interface GithubServer extends ServerDescriptor {
  tools: {
    'search_repositories': { input: { query: string; limit?: number }; output: unknown }
    'create_issue': { input: { repo: string; title: string; body?: string }; output: unknown }
  }
  resources: {}
  prompts: {}
  capabilities: { tools: {} } & Record<string, unknown>
}

export interface LinearServer extends ServerDescriptor {
  tools: {
    'linear_create_issue': { input: { title: string; teamId: string }; output: unknown }
  }
  resources: {}
  prompts: {}
  capabilities: { tools: {} } & Record<string, unknown>
}

export interface MCPServers extends Record<string, ServerDescriptor> {
  'github': GithubServer
  'linear': LinearServer
}
```

### 4. Use generated types at runtime

**Single server:**

```ts
import type { GithubServer } from './mcp-types.generated'
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient<GithubServer>({
  transport: { type: 'http', url: process.env.GITHUB_MCP_URL! },
})

const tools = await mcp.tools()
// Each tool name is narrowed from GithubServer['tools']
```

**Multi-server pool:**

```ts
import type { MCPServers } from './mcp-types.generated'
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients<MCPServers>({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: {
    transport: { type: 'http', url: process.env.LINEAR_MCP_URL! },
    prefix: 'linear',
  },
})

// Config keys are constrained to the declared servers — a typo is a compile error
const tools = await pool.tools()
```

## Full Server + Client Example

Here is a complete Next.js App Router route that connects to two MCP servers and streams the response to the browser.

**Server route (`app/api/chat/route.ts`):**

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClients } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const body = await request.json()

  if (typeof body !== 'object' || body === null || !Array.isArray(body.messages)) {
    return new Response('Bad request', { status: 400 })
  }

  const pool = await createMCPClients({
    github: {
      transport: {
        type: 'http',
        url: process.env.GITHUB_MCP_URL!,
        headers: { Authorization: `Bearer ${process.env.GITHUB_MCP_TOKEN}` },
      },
    },
    linear: {
      transport: {
        type: 'http',
        url: process.env.LINEAR_MCP_URL!,
        headers: { Authorization: `Bearer ${process.env.LINEAR_MCP_TOKEN}` },
      },
    },
  })

  try {
    const stream = chat({
      adapter: openaiText(),
      model: 'gpt-4o',
      messages: body.messages,
      tools: await pool.tools(),
    })

    return toServerSentEventsResponse(stream)
  } finally {
    await pool.close()
  }
}
```

**Client component (`components/Chat.tsx`):**

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

export function Chat() {
  const { messages, sendMessage, status } = useChat(chatOptions)

  return (
    <div>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <strong>{m.role}:</strong> {m.content}
          </li>
        ))}
      </ul>
      <button
        onClick={() => sendMessage({ content: 'List my open GitHub issues' })}
        disabled={status === 'streaming'}
      >
        Ask
      </button>
    </div>
  )
}
```

## Error Reference

| Error class | When thrown |
|---|---|
| `MCPConnectionError` | `createMCPClient` fails to connect, or a method is called after `close()` |
| `DuplicateToolNameError` | Two tools have the same name within one client or across the pool |
| `MCPToolNotFoundError` | A `toolDefinition` name passed to `tools([...defs])` is not found on the server |

## Next Steps

- [Tools Overview](./tools) — TanStack AI tool concepts
- [Server Tools](./server-tools) — Server-side tool execution patterns
- [Lazy Tool Discovery](./lazy-tool-discovery) — Reduce token usage with large tool sets
- [Tool Approval Flow](./tool-approval) — Require user confirmation before executing tools
