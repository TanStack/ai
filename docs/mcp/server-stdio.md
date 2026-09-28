---
title: MCP Server on stdio
id: mcp-server-stdio
order: 13
description: "Serve the same MCP server on stdin and stdout with serveMCPStdio so a desktop host can start it."
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

A desktop host does not call your HTTP route. The host starts a local Node process. Then the host writes JSON-RPC on stdin. The host reads each answer on stdout.

`serveMCPStdio` sends each stdin message to the server from `createMCPServer`. Then this function writes each answer on stdout.

## Serve on stdio

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

1. Create `server.ts` from the code block.
2. Compile `server.ts` to JavaScript.
3. Set the host command to `node`.
4. Set the host arguments to the compiled file.

## Keep stdout for the protocol

stdout carries only protocol messages.

The `console.error` call in the file writes to stderr.

Do not call `console.log` in this process.

The call writes on stdout. Then the host cannot parse the message.

## Node only

The `@tanstack/ai-mcp/server/stdio` entry is for Node only.

For an HTTP route, see [Serve tools over HTTP](./server).

## Stop the reader

`serveMCPStdio` returns an object with `close()`.

When stdin ends, the reader stops.

When your process must stop the reader, call `stdio.close()`.

The host can call `get_weather`. The server writes the answer on stdout.
