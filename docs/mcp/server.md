---
title: Serve Tools over HTTP
id: mcp-server
order: 13
description: "Serve your TanStack tools as an MCP server with createMCPServer, so Claude Desktop, Cursor, or any other MCP host can call them."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp server
  - createMCPServer
  - tanstack start
  - cloudflare workers
---

`createMCPServer` exposes your TanStack server tools over MCP. A host such as Claude Desktop or Cursor can then call them.

Your route returns `server.fetch(request)`, and the host connects to that URL.

## Quick setup

This setup uses TanStack Start. For Cloudflare Workers, see [Cloudflare Workers](#cloudflare-workers).

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-mcp @modelcontextprotocol/server zod
vue: @tanstack/ai @tanstack/ai-mcp @modelcontextprotocol/server zod
solid: @tanstack/ai @tanstack/ai-mcp @modelcontextprotocol/server zod
svelte: @tanstack/ai @tanstack/ai-mcp @modelcontextprotocol/server zod
preact: @tanstack/ai @tanstack/ai-mcp @modelcontextprotocol/server zod
angular: @tanstack/ai @tanstack/ai-mcp @modelcontextprotocol/server zod
vanilla: @tanstack/ai @tanstack/ai-mcp @modelcontextprotocol/server zod
octane: @tanstack/ai @tanstack/ai-mcp @modelcontextprotocol/server zod

<!-- ::end:tabs -->

2. Create `src/mcp-server.ts` with your tools:

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

3. Create the route, and send each request to `handleMcp`:

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

4. Start the app. Then add the URL of the route (for example, `http://localhost:3000/api/mcp`) to your MCP host.

The host lists `get_weather`, and it can call the tool. The answer is `Sunny in Paris` for the city `Paris`.

For a full app with a tool, a resource, and a prompt, follow [Build an MCP Server](../tutorials/mcp-server).

## How it works

- You create the server once. `handleMcp` calls `server.fetch` for each request.
- The server speaks MCP over HTTP. It finds the tool by name, parses the input with `inputSchema`, and runs your `.server()` function.
- By default the server keeps no session. As a result, any instance can answer any request, and a serverless host works with no extra setup.

To call this server from your own `chat()` route, see [MCP Server Tools](../tools/mcp).

## Cloudflare Workers

1. Save the server code from the quick setup as `src/mcp-server.ts`.
2. Call `handleMcp` for each request:

```ts
// src/index.ts
import { handleMcp } from './mcp-server'

export default {
  async fetch(request: Request) {
    return handleMcp(request)
  },
}
```

The worker URL is the MCP URL. Each request can reach a different instance. This works because the server keeps no spec 2025 session by default. See [MCP Server Sessions](./server-sessions).

## Tell the host what a tool does

A host asks the user before it runs a tool, unless the tool says that it only reads. Set `metadata.title` and `metadata.annotations` on the tool definition. The host gets them as the MCP tool title and annotations.

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const listNotes = toolDefinition({
  name: 'list_notes',
  description: 'List the notes of the signed-in user',
  inputSchema: z.object({}),
  metadata: {
    title: 'List notes',
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
}).server(async () => [])
```

The annotation names are the MCP names:

- `readOnlyHint`: the tool changes nothing.
- `destructiveHint`: the tool can delete or overwrite data.
- `idempotentHint`: a repeat call with the same input changes nothing more.
- `openWorldHint`: the tool reaches outside your system.

To show an [MCP Apps](./apps) view for a tool, set `metadata._meta`. The host gets it as the MCP tool `_meta`. The key `ui.resourceUri` links the tool to the `ui://` resource of the view.

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const showChart = toolDefinition({
  name: 'show_chart',
  description: 'Show the sales chart',
  inputSchema: z.object({}),
  metadata: {
    _meta: { ui: { resourceUri: 'ui://charts/sales' } },
  },
}).server(async () => ({ total: 42 }))
```

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

Now `callTool('get_weather', { city })` goes to the deployed server, and `callTool('get_wether', { city })` fails the type check.

What the types check:

- `callTool` accepts only the tool names of `server`, and the input type of each tool.
- `getPrompt` accepts only the prompt names of `server`, and the argument type of each prompt.
- `readResource` accepts only the resource URIs of `server`.

`import type` keeps the server code out of the app bundle.

## Add more to your server

Pick the one you need:

- Serve documents and prompts: [Serve Resources and Prompts](./server-content).
- Let only signed-in users call the tools: [MCP Server Auth](./server-auth).
- Ask the user a question from a tool: [Ask for Input](./server-input).
- Run a long tool in the background: [MCP Server Tasks](./server-tasks).
- Let a desktop host start your server as a local process: [MCP Server on stdio](./server-stdio).

## Advanced

### Log SDK errors

Some errors never reach your tool code:

- transport errors
- protocol errors
- rejected requests

Pass `onerror` to send them to your logs. `serveMCPStdio` also sends its transport errors there. `onerror` only reports. The response does not change.

```ts
import { createMCPServer } from '@tanstack/ai-mcp/server'

const server = createMCPServer({
  name: 'weather',
  version: '1.0.0',
  onerror: (error) => console.error('MCP error', error),
})
```

### Serve an MCP extension

An [MCP extension](https://modelcontextprotocol.io/extensions/overview) adds methods that the core spec does not have. For example, the [Skills extension](https://modelcontextprotocol.io/extensions/skills/overview) adds `skills/list` and `skills/get`. A client uses an extension only when the server lists it in `capabilities.extensions`.

Pass `setup` to get each SDK `McpServer` before it connects. Declare the extension there, then add a handler for each of its methods:

```ts
import { createMCPServer } from '@tanstack/ai-mcp/server'
import { z } from 'zod'

const server = createMCPServer({
  name: 'notes',
  version: '1.0.0',
  setup: (mcp, context) => {
    const userId = context?.userId
    mcp.server.registerCapabilities({
      extensions: { 'com.example/notes': {} },
    })
    mcp.server.setRequestHandler(
      'notes/count',
      { params: z.object({}) },
      () => ({ count: typeof userId === 'string' ? userId.length : 0 }),
    )
  },
})

export function handleMcp(request: Request, userId: string) {
  return server.handle(request, { context: { userId } })
}
```

Rules for `setup`:

- It runs each time the server builds an `McpServer`. That is each request, or once for each spec 2025 session when `sessions` is `'memory'`. Keep it fast.
- The second argument is the `context` object from `server.handle`. On a spec 2025 memory session, that value is from the request that opened the session. A later request on that session does not run `setup` again. A tool on the later request sees the new context.
- It must be synchronous. The server connects as soon as `setup` returns, so an `async` function fails the request.
- Add new methods only. Do not replace a method that the server already handles, such as `tools/call`.

To call the method from a client, see [Extension methods](../tools/mcp-manual#extension-methods).

### Shape the result yourself

By default, the server shapes the tool result for you:

- It parses the tool output with its `outputSchema`. If the output does not match, the call returns a tool error that names the tool.
- It sends the output as one text block.
- If the output is an object, it also goes on `structuredContent`.

When you want more than one block, or `isError` without an exception, return an MCP `CallToolResult` from a tool with no `outputSchema`. The server sends it as is.

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { db } from './db'

export const countNotes = toolDefinition({
  name: 'count_notes',
  description: 'Count the notes and list them',
  inputSchema: z.object({}),
}).server(async () => {
  const notes = await db.notes.list()
  return {
    content: [
      { type: 'text' as const, text: `${notes.length} notes.` },
      { type: 'text' as const, text: JSON.stringify(notes) },
    ],
    structuredContent: { count: notes.length },
  }
})
```

The first block is a short summary for the model. The second block is the data.

### Fixed lists and subscriptions

`createMCPServer` serves fixed lists of tools, resources, and prompts. As a result:

- It reports `listChanged: false`.
- It answers `subscriptions/listen` with JSON-RPC `-32601`.
- A Worker does not keep an idle subscription stream open.

### What the typed HTTP client returns

For `createMCPClient<typeof server>({ transport })`:

- The client connects to the URL and speaks MCP. The server `auth` option runs, the same as for any host.
- `callTool` returns the MCP result. For a tool with an `outputSchema`, `structuredContent` has the output type of the tool.

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
- `callTool` parses the output with the tool `outputSchema`, the same as the HTTP server.
- `readResource(uri, context)` puts `context` on the resource `ctx.context`. Without it, `ctx.context` is `{}`.
