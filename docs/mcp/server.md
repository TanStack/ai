---
title: Serve Tools over HTTP
id: mcp-server
order: 13
description: "Serve TanStack tools over HTTP with createMCPServer so a host can call them."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp server
  - createMCPServer
  - tanstack start
  - cloudflare workers
---

You have TanStack server tools. A host cannot call those tools over HTTP.

For a tool, a resource, and a prompt in one app, open [Build an MCP Server](../tutorials/mcp-server).

`createMCPServer` serves those tools over MCP. Return `server.fetch(request)` from your route.

```ts
// src/mcp-server.ts
import { toolDefinition } from '@tanstack/ai'
import { createMCPServer } from '@tanstack/ai-mcp/server'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather for a city',
  inputSchema: z.object({
    city: z.string(),
  }),
}).server(async ({ city }) => {
  return `Sunny in ${city}`
})

export const server = createMCPServer({
  name: 'weather',
  version: '1.0.0',
  tools: [getWeather],
})

export function handleMcp(request: Request) {
  return server.fetch(request)
}
```

Create the server once. `handleMcp` calls `fetch` for each request.

## Installation

Install these packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mcp @modelcontextprotocol/server
vue: @tanstack/ai-mcp @modelcontextprotocol/server
solid: @tanstack/ai-mcp @modelcontextprotocol/server
svelte: @tanstack/ai-mcp @modelcontextprotocol/server
preact: @tanstack/ai-mcp @modelcontextprotocol/server
angular: @tanstack/ai-mcp @modelcontextprotocol/server
vanilla: @tanstack/ai-mcp @modelcontextprotocol/server
octane: @tanstack/ai-mcp @modelcontextprotocol/server

<!-- ::end:tabs -->

## TanStack Start

1. Save the server code as `src/mcp-server.ts`.
2. Forward each request to `handleMcp`.

```ts ignore
// src/routes/api.mcp.ts
import { createFileRoute } from '@tanstack/react-router'
import { handleMcp } from '../mcp-server'

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => handleMcp(request),
      POST: ({ request }) => handleMcp(request),
      DELETE: ({ request }) => handleMcp(request),
    },
  },
})
```

The route path is `/api/mcp`.

## Cloudflare Workers

1. Save the server code as `src/mcp-server.ts`.
2. Call `handleMcp` for each request.

```ts
// src/index.ts
import { handleMcp } from './mcp-server'

export default {
  async fetch(request: Request) {
    return handleMcp(request)
  },
}
```

The worker URL is the MCP URL.

The host can list `get_weather`. Then the host can call that tool.

To call this URL from `chat()`, see [MCP Server Tools](../tools/mcp).

## Call the server with types

Your app calls the deployed server. You want a wrong tool name or a wrong argument to fail at compile time.

1. Export `server` from `src/mcp-server.ts`.
2. In the app, import its type with `import type`.
3. Pass `typeof server` to `createMCPClient`, with the URL of the server.

```ts
// app/weather.ts
import { createMCPClient } from '@tanstack/ai-mcp'
import type { server } from '../src/mcp-server'

export async function forecast(city: string) {
  const client = await createMCPClient<typeof server>({
    transport: { type: 'http', url: 'https://mcp.example.com/api/mcp' },
  })
  try {
    return await client.callTool('get_weather', { city })
  } finally {
    await client.close()
  }
}
```

The client connects to the URL and speaks MCP. The server `auth` option runs, the same as for any host.

- `callTool` accepts only the tool names of `server`, and each tool's input type.
- `callTool` returns the MCP result. For a tool with an `outputSchema`, `structuredContent` has the tool output type.
- `getPrompt` accepts only the prompt names of `server`, and each prompt's argument type.
- `readResource` accepts only the resource URIs of `server`.
- `import type` keeps the server code out of the app bundle.

### Call the server in the same process

When the app and the server run in one process, pass the server object:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'
import { server } from '../src/mcp-server'

const client = await createMCPClient({ server })
const text = await client.callTool('get_weather', { city: 'Paris' })
```

This client opens no connection. It calls the tool function directly and returns the tool output.

- The server `auth` option does not run.
- The client has no `tools()`, so you cannot pass it to `chat()`.
- A tool gets the spec 2026 context. `ctx.context.requestInput` throws, and `ctx.context.sample` uses the `sample` option of the server.

Now `callTool('get_weather', { city })` goes to the deployed server, and `callTool('get_wether', { city })` fails the type check.

If the host starts a local process, see [MCP Server on stdio](./server-stdio).
