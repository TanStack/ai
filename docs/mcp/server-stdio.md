---
title: MCP Server on stdio
id: mcp-server-stdio
order: 13
description: "Serve the same MCP server on stdin and stdout with serveMCPStdio, so a desktop host can start it as a local process."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp server
  - stdio
  - serveMCPStdio
  - createMCPServer
  - node
---

A desktop host does not call your HTTP route. It starts a local Node process, writes JSON-RPC on stdin, and reads each answer on stdout.

`serveMCPStdio` connects your `createMCPServer` server to stdin and stdout. You keep the same tools.

## Quick setup

1. Create `server.ts`:

```ts
// server.ts
import { toolDefinition } from '@tanstack/ai'
import { createMCPServer } from '@tanstack/ai-mcp/server'
import { serveMCPStdio } from '@tanstack/ai-mcp/server/stdio'
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

const server = createMCPServer({
  name: 'weather',
  version: '1.0.0',
  tools: [getWeather],
})

const stdio = serveMCPStdio(server)

console.error('The weather server is ready')
```

2. Compile `server.ts` to JavaScript.
3. In the host, set the command to `node`.
4. Set the host arguments to the compiled file.

The host starts the process and can call `get_weather`. The server writes the answer on stdout.

## How it works

- `serveMCPStdio` reads each message from stdin and sends it to the server.
- It writes each answer on stdout.
- The `@tanstack/ai-mcp/server/stdio` entry is for Node only. For an HTTP route, see [Serve Tools over HTTP](./server).

## Keep stdout for the protocol

stdout carries only protocol messages. If you write anything else there, the host cannot parse the messages.

- Do not call `console.log` in this process. It writes on stdout.
- Use `console.error` for your logs. It writes on stderr.

## Advanced

### Stop the reader

`serveMCPStdio` returns an object with `close()`.

- When stdin ends, the reader stops.
- When your process must stop the reader, call `stdio.close()`.

### Sessions on stdio

`serveMCPStdio` uses `sessions: 'memory'` when you do not set `sessions`. A stdio process serves one client, so the server can ask a spec 2025 client for input or a sample. See [MCP Server Sessions](./server-sessions).
