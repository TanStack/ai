---
title: Ask for Input
id: mcp-server-input
order: 13
description: "Ask the user for a value inside an MCP server tool with requestInput, for example a yes before a delete."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - requestInput
  - confirmation
  - input required
  - MCPToolContext
---

An MCP tool can stop and ask the user before it runs. Use that when the tool deletes a file or sends data.

Call `ctx.context.requestInput` inside the tool. The host shows your message to the user, and the call returns the answer.

## Quick setup

You need an MCP server first. If you do not have one, start with [Serve Tools over HTTP](./server).

1. Give `.server()` the type `MCPToolContext`, so `ctx.context.requestInput` type-checks.
2. Call `requestInput` with the message for the user.
3. Act on the answer.

```ts
import { toolDefinition } from '@tanstack/ai'
import { createMCPServer } from '@tanstack/ai-mcp/server'
import type { MCPToolContext } from '@tanstack/ai-mcp/server'
import { z } from 'zod'

const deleteFile = toolDefinition({
  name: 'delete_file',
  description: 'Delete a file after the user says yes',
  inputSchema: z.object({
    path: z.string(),
  }),
}).server<MCPToolContext>(async ({ path }, ctx) => {
  const answer = await ctx.context.requestInput({
    message: `Delete ${path}? Type yes to continue.`,
  })

  if (answer !== 'yes') {
    return `Kept ${path}.`
  }

  return `Deleted ${path}.`
})

const server = createMCPServer({
  name: 'files',
  version: '1.0.0',
  tools: [deleteFile],
})

export function fetch(request: Request) {
  return server.fetch(request)
}
```

If the user sends `yes`, the tool returns `Deleted` plus the file path. Any other answer returns `Kept` plus the path.

## How it works

- `ctx` is the second argument of the function that you pass to `.server()`.
- `requestInput` returns the string that the user sends.
- If the user declines or cancels, `requestInput` throws an Error. The tool call then ends with a tool error.

A TanStack `chat()` host pauses on the request and shows it to the user. [MCP Client Input](../tools/mcp-input) shows how the user answers.

## Advanced

### Spec 2025 and spec 2026

The two MCP spec versions ask for input in different ways.

On spec 2025:

- `requestInput` needs `sessions: 'memory'`. Without a session, it throws. See [MCP Server Sessions](./server-sessions).
- `requestInput` waits on the open session. The same tool call then continues with the answer.

On spec 2026:

- The handler returns `input_required`. Then the client runs the tool again with the answer.
- The code before `requestInput` runs on each call, so it can run more than once. If work must run once, put it after `requestInput` returns.
- A tool asks one question per call. A second `requestInput` in the same call throws an Error. To ask two questions, use two tools.

### Task tools

`requestInput` does not work in an `execution: 'task'` tool. [MCP Server Tasks](./server-tasks) has the details.
