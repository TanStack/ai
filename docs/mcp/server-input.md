---
title: Ask for Input
id: mcp-server-input
order: 13
description: "Ask the user for a value inside an MCP server tool with requestInput."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - requestInput
  - confirmation
  - input required
  - MCPToolContext
---

Before your tool deletes a file, your tool must get a confirmation from the user. Call `requestInput` on `ctx.context` for that confirmation.

`ctx` is the second argument of the function you pass to `.server()`. Give `.server()` the type `MCPToolContext`, so `ctx.context.requestInput` type-checks.

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

`requestInput` returns the string that the user sends.

If the user declines or cancels, `requestInput` throws an Error. The tool call then ends with a tool error.

## Spec 2025 and spec 2026

On spec 2025, `requestInput` waits on the open session. The same tool call then continues with the answer.

On spec 2026, the handler returns `input_required`. Then the client runs the tool again with the answer. On spec 2026, the code before `requestInput` runs on each call, so it can run more than once.

If the work must run once, put that work after `requestInput` returns.

On spec 2026, a tool asks one question per call. A second `requestInput` in the same call throws an Error. To ask two questions, use two tools.

A TanStack `chat()` host pauses on `input_required` and shows the request to the user. [MCP Client Input](../tools/mcp-input) shows how the user answers.

`requestInput` does not work in an `execution: 'task'` tool. [MCP Server Tasks](./server-tasks) has the details.

If the user sends `yes`, the tool returns `Deleted` plus the file path.
