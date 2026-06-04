---
name: ai-mcp
description: >
  Host-side Model Context Protocol (MCP) client for TanStack AI: connect to
  external MCP servers, discover and run their tools inside any adapter's
  chat() loop, read resources and prompts, generate end-to-end TypeScript types
  with the bundled CLI, and manage lifecycle with close()/await using.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/tools/mcp.md'
  - 'TanStack/ai:packages/ai-mcp/src/client.ts'
  - 'TanStack/ai:packages/ai-mcp/src/pool.ts'
  - 'TanStack/ai:packages/ai-mcp/src/resources.ts'
  - 'TanStack/ai:packages/ai-mcp/src/transport.ts'
---

# `@tanstack/ai-mcp`

This skill covers the `@tanstack/ai-mcp` package. Read `ai-core/tool-calling/SKILL.md`
first — MCP tools flow into `chat()` the same way hand-written tools do.

## When to use this package

Use `@tanstack/ai-mcp` when:

- A third-party MCP server exposes tools you want an agent or chat loop to call.
- You want to read MCP server resources (files, text, data) or prompts into a
  `chat()` message list.
- You want end-to-end TypeScript types for an external MCP server's tool
  signatures (via the bundled `generate` CLI).
- You are running tool execution on the server side and want to connect to MCP
  servers with HTTP (Streamable HTTP or SSE) or stdio transports.

Do NOT use this package for browser/client-side code — MCP connections are
server-side only.

## Install

```bash
pnpm add @tanstack/ai-mcp
```

The package has two subpath exports:

- `.` — main client API (`createMCPClient`, `createMCPClients`, converters, types)
- `./stdio` — Node-only stdio transport factory (`stdioTransport`); import it
  separately so edge bundles stay clean

## `createMCPClient` — single server

```typescript
import { createMCPClient } from '@tanstack/ai-mcp'

const client = await createMCPClient({
  transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
  prefix: 'weather', // optional: prefixes all tool names (e.g. 'weather_get_forecast')
  name: 'my-app', // optional: client identity sent to the server
})
```

`createMCPClient` connects immediately and returns an `MCPClient`. Throws
`MCPConnectionError` if the connection fails.

### Transports

#### Streamable HTTP (default for internet-facing servers)

```typescript
const client = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://mcp.example.com/mcp',
    headers: { Authorization: 'Bearer sk-...' },
  },
})
```

#### SSE

```typescript
const client = await createMCPClient({
  transport: {
    type: 'sse',
    url: 'https://mcp.example.com/sse',
    headers: { Authorization: 'Bearer sk-...' },
  },
})
```

#### stdio (Node-only — import from `/stdio` subpath)

```typescript
import { createMCPClient } from '@tanstack/ai-mcp'
import { stdioTransport } from '@tanstack/ai-mcp/stdio'

const client = await createMCPClient({
  transport: stdioTransport({
    command: 'npx',
    args: ['-y', 'my-mcp-server'],
    env: { API_KEY: process.env.API_KEY ?? '' },
  }),
})
```

#### Custom transport (escape hatch)

Pass any SDK `Transport` instance directly:

```typescript
import { createMCPClient } from '@tanstack/ai-mcp'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

const [clientTransport] = InMemoryTransport.createLinkedPair()
const client = await createMCPClient({ transport: clientTransport })
```

## Three type-safety modes

### Mode 1 — Auto-discovery (no types needed)

`client.tools()` lists every tool the server exposes. Args are typed `unknown`
at compile time but the tool's JSON Schema is forwarded to the LLM.

```typescript
const tools = await client.tools()
// tools: ServerTool[]  (args unknown)

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  tools,
})
```

Use `{ lazy: true }` to defer schema sending via the existing `LazyToolManager`:

```typescript
const tools = await client.tools({ lazy: true })
```

### Mode 2 — Typed via `toolDefinition` instances

Pass bare `toolDefinition()` instances (no `.server()` call) to `client.tools([...])`.
The MCP client binds a `callTool` proxy as the execute function while
input/output validation and TypeScript types come from the definitions' Zod schemas.
Only the named tools are returned (allowlist = the definitions' `name`s).
Throws `MCPToolNotFoundError` if the server does not expose a tool with that name.

```typescript
import { toolDefinition } from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { z } from 'zod'

const getWeatherDef = toolDefinition({
  name: 'get_weather',
  description: 'Current weather for a city',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temperature: z.number(), conditions: z.string() }),
})

const client = await createMCPClient({
  transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
})

// Returns MappedServerTools<typeof defs> — fully typed per definition.
const tools = await client.tools([getWeatherDef])
```

### Mode 3 — Generated end-to-end types (via `generate` CLI)

Run `npx @tanstack/ai-mcp generate` to introspect live servers and emit a
`ServerDescriptor` interface per server. Pass the generated interface as the
generic to `createMCPClient<WeatherServer>(...)` to type the whole client.

See the "Codegen CLI" section below for details.

## Lifecycle

**The caller owns the lifecycle.** `chat()` never closes the client.

```typescript
// Option 1: explicit close
const client = await createMCPClient({
  transport: { type: 'http', url: '...' },
})
try {
  const tools = await client.tools()
  const stream = chat({ adapter: openaiText('gpt-4o'), messages, tools })
  return toServerSentEventsResponse(stream)
} finally {
  await client.close()
}

// Option 2: await using (TypeScript 5.2+ with Symbol.asyncDispose)
await using client = await createMCPClient({
  transport: { type: 'http', url: '...' },
})
const tools = await client.tools()
// client.close() called automatically at scope exit
```

## `chat({ mcp })` — discovery + lifecycle in one prop

Rather than calling `client.tools()` and `client.close()` yourself, pass the
`mcp` option to `chat()` and let it manage the full lifecycle.

```typescript
// ChatMCPOptions shape:
// mcp: {
//   clients: Array<MCPClient | MCPClients>,
//   connection?: 'close' | 'keep-alive',  // default: 'close'
//   lazyTools?: boolean,
//   onDiscoveryError?: (error: unknown, source) => void,
// }
```

**Behavior:**

- `chat()` calls `.tools()` on every entry in `clients` at run start and merges
  all results into the tool list.
- `lazyTools: true` is forwarded to `tools({ lazy: true })`.
- `connection: 'close'` (default) — each client is closed after tool discovery
  completes. Use `'keep-alive'` when tools may still be called after discovery
  (agent loops, multi-turn runs).
- `onDiscoveryError`: throw (or re-throw) to abort the entire call; return
  normally to skip that source and continue. Omitting the handler re-throws
  (fail-fast).

**When to use `mcp` vs. the tools spread:**

| Approach                                                | Use when                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `chat({ mcp: { clients: [...] } })`                     | Convenience: discovery + lifecycle handled for you; untyped args are fine |
| `tools: [...await client.tools([toolDefinition(...)])]` | Fully-typed args/results via Zod schemas (`toolDefinition` mode)          |

**Server-side example:**

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const mcpClient = await createMCPClient({
    transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
  })

  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
    mcp: {
      clients: [mcpClient],
      connection: 'keep-alive', // keep open while the agent may still call tools
      onDiscoveryError: (err, source) => {
        console.warn('MCP discovery failed for source, skipping:', err)
        // returning skips this source; throw to fail the whole call fast
      },
    },
  })

  return toServerSentEventsResponse(stream)
  // connection: 'keep-alive' — chat() never closes mcpClient; it stays warm for the next request.
}
```

You can also pass an `MCPClients` pool directly:

```typescript
const pool = await createMCPClients({
  github: { transport: { type: 'http', url: 'https://mcp.github.com/mcp' } },
  linear: { transport: { type: 'http', url: 'https://mcp.linear.app/mcp' } },
})

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  mcp: { clients: [pool], connection: 'keep-alive' },
})
```

## `createMCPClients` — multiple servers

Connect to many MCP servers in parallel. Each config key becomes the default
prefix for that server's tools, preventing name collisions across servers.

```typescript
import { createMCPClients } from '@tanstack/ai-mcp'

await using pool = await createMCPClients({
  github: { transport: { type: 'http', url: 'https://mcp.github.com/mcp' } },
  linear: { transport: { type: 'http', url: 'https://mcp.linear.app/mcp' } },
})

// Tool names auto-prefixed: 'github_search_repos', 'linear_create_issue', etc.
const tools = await pool.tools()

// Forward lazy flag to every server:
const lazyTools = await pool.tools({ lazy: true })

// Per-server typed access:
const githubTools = await pool.clients.github.tools()
```

`createMCPClients` connects in parallel, closes already-connected clients if
any connection fails (no leaks), and throws `MCPConnectionError` naming the
failed server(s).

Override or disable prefixing:

```typescript
await using pool = await createMCPClients({
  github: { transport: { ... }, prefix: 'gh' },    // 'gh_search_repos'
  linear: { transport: { ... }, prefix: '' },        // 'create_issue' (no prefix)
})
```

## Abort signal — cancelling in-flight MCP calls

MCP tool calls are automatically cancelled when the chat run's `AbortController`
fires (e.g. client disconnect, server abort). The `abortSignal` is threaded
through `ToolExecutionContext` into every `callTool` call with no extra code.

You can also read it in a hand-written server tool that wraps an MCP call:

```typescript
const myTool = myDef.server(async (args, ctx) => {
  // Forward to any async work that accepts an AbortSignal.
  const result = await fetch('https://slow.api/data', {
    signal: ctx?.abortSignal,
  })
  return result.json()
})
```

## Resources

```typescript
// List all resources the server exposes.
const resources = await client.resources()

// Read a specific resource by URI.
const resource = await client.readResource(resources[0].uri)

// Convert one content block to a TanStack ContentPart.
import { mcpResourceToContentPart } from '@tanstack/ai-mcp'

const part = mcpResourceToContentPart(resource.contents[0])
// part: ContentPart  (type: 'text' always for v1)
```

Inject resources into a chat turn:

```typescript
import { chat } from '@tanstack/ai'
import { createMCPClient, mcpResourceToContentPart } from '@tanstack/ai-mcp'

const client = await createMCPClient({
  transport: { type: 'http', url: '...' },
})
const resource = await client.readResource('file:///project/README.md')
const parts = resource.contents.map(mcpResourceToContentPart)

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        ...parts,
        { type: 'text', content: 'Summarize this document.' },
      ],
    },
  ],
})
```

## Prompts

```typescript
// List prompts the server exposes.
const prompts = await client.prompts()

// Get a prompt (with optional arguments).
const prompt = await client.getPrompt('review_code', { language: 'TypeScript' })

// Convert to TanStack ModelMessage[] for use in chat().
import { mcpPromptToMessages } from '@tanstack/ai-mcp'

const messages = mcpPromptToMessages(prompt)
// messages: ModelMessage[]  (role: 'user' | 'assistant')

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages: [...messages, ...userMessages],
})
```

## Codegen CLI

Generate end-to-end TypeScript types by introspecting live MCP servers.

**1. Create `mcp.config.ts` at your project root:**

```typescript
import { defineConfig } from '@tanstack/ai-mcp'

export default defineConfig({
  servers: {
    github: {
      transport: { type: 'http', url: 'https://mcp.github.com/mcp' },
      // prefix must match the runtime createMCPClient({ prefix }) value
    },
  },
  outFile: './src/mcp-types.generated.ts',
})
```

**2. Run the generator:**

```bash
npx @tanstack/ai-mcp generate
```

This connects to each server, lists its tools/resources/prompts, converts JSON
Schemas to TypeScript, and writes one `interface <Name>Server extends ServerDescriptor`
per server plus a combined `interface MCPServers` for pool typing.

**3. Use the generated types:**

```typescript
// Single server — narrows tools() return to descriptor-keyed tool names.
import type { GithubServer } from './src/mcp-types.generated'
import { createMCPClient } from '@tanstack/ai-mcp'

const client = await createMCPClient<GithubServer>({
  transport: { type: 'http', url: 'https://mcp.github.com/mcp' },
})
const tools = await client.tools() // typed to GithubServer's tool names

// Multiple servers via the generated MCPServers map.
import type { MCPServers } from './src/mcp-types.generated'

const pool = await createMCPClients<MCPServers>({
  github: { transport: { type: 'http', url: 'https://mcp.github.com/mcp' } },
})
// pool.clients.github is MCPClient<GithubServer>
// missing/extra keys are a compile error
```

Codegen deps (`json-schema-to-typescript`, `jiti`) are bundled into the CLI bin
and do NOT appear in the library's runtime dependency graph.

## Error classes

- `MCPConnectionError` — thrown when a server connection fails or when calling
  methods after `close()`.
- `MCPToolNotFoundError` — thrown from `client.tools([defs])` when a definition's
  `name` is not exposed by the server.
- `DuplicateToolNameError` — thrown by a single pool's own `tools()` when two
  tools within that pool share the same name (same server or pool clients with no
  prefix). Exported from `@tanstack/ai-mcp`.
- `MCPDuplicateToolNameError` — thrown by `chat()` when tools from separate
  `mcp.clients` entries collide after merging. Exported from `@tanstack/ai`
  (not `@tanstack/ai-mcp`), so users can `instanceof` it at the `chat()` call site.

```typescript
import {
  MCPConnectionError,
  MCPToolNotFoundError,
  DuplicateToolNameError,
} from '@tanstack/ai-mcp'

import { MCPDuplicateToolNameError } from '@tanstack/ai'
```

## Complete server-route example

```typescript
// api/chat/route.ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClients } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const { messages } = await request.json()

  await using pool = await createMCPClients({
    github: {
      transport: { type: 'http', url: 'https://mcp.github.com/mcp' },
    },
    linear: {
      transport: {
        type: 'http',
        url: 'https://mcp.linear.app/mcp',
        headers: { Authorization: `Bearer ${process.env.LINEAR_KEY ?? ''}` },
      },
    },
  })

  const tools = await pool.tools()

  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
    tools,
  })

  return toServerSentEventsResponse(stream)
  // pool.close() called automatically by await using at scope exit
}
```

## Common Mistakes

### a. HIGH: closing the client before the stream finishes

`chat()` executes tools lazily as the model calls them during streaming.
If you close the MCP client before the response stream is fully consumed,
in-flight tool calls will fail.

Wrong:

```typescript
const tools = await client.tools()
const stream = chat({ adapter, messages, tools })
await client.close() // closes before the stream runs tools
return toServerSentEventsResponse(stream)
```

Correct — use `await using` or close after stream consumption, or use `onFinish`
middleware:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'

const client = await createMCPClient({
  transport: { type: 'http', url: '...' },
})

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  tools: await client.tools(),
  middleware: [
    {
      onFinish: async () => {
        await client.close()
      },
    },
  ],
})
return toServerSentEventsResponse(stream)
```

### b. HIGH: importing `stdioTransport` from the main entry point

`stdioTransport` is only available from `@tanstack/ai-mcp/stdio`. Importing it
from `@tanstack/ai-mcp` will fail with a module-not-found error and would
bundle Node.js child-process code into edge bundles.

Wrong:

```typescript
import { stdioTransport } from '@tanstack/ai-mcp' // does not exist here
```

Correct:

```typescript
import { stdioTransport } from '@tanstack/ai-mcp/stdio'
```

### c. MEDIUM: using `client.tools([defs])` without matching names

The name field on each `toolDefinition` must exactly match the tool name the MCP
server exposes. Mismatches throw `MCPToolNotFoundError` at call time, not at
type-check time (unless generated types are in use).

### d. MEDIUM: not setting a prefix when multiple servers share tool names

Two different errors can arise depending on where the collision is detected:

- **Within a single `createMCPClients` pool** — calling `pool.tools()` throws
  `DuplicateToolNameError` (from `@tanstack/ai-mcp`) when two servers in that
  pool expose the same name with no prefix to separate them.
- **Across separate `mcp.clients` entries in `chat()`** — `chat()` throws
  `MCPDuplicateToolNameError` (from `@tanstack/ai`) after merging discovered
  tools from all `mcp.clients` entries.

In both cases, the fix is the same: use `createMCPClients` (which auto-prefixes
by config key) or set an explicit `prefix` on each `createMCPClient` call.

## Cross-References

- See also: ai-core/tool-calling/SKILL.md — MCP tools are ServerTools; all tool
  patterns (approval, lazy, client-side) apply.
- See also: ai-core/chat-experience/SKILL.md — wiring tools into `chat()`.
