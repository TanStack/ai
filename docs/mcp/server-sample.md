---
title: Draft Text from a Tool
id: mcp-server-sample
order: 13
description: "Call ctx.context.sample from an MCP server tool so the tool can return a draft."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - createMCPServer
  - sample
  - ctx.context.sample
  - mcp server
  - MCPToolContext
---

You want the tool to return a draft. The tool has no model result yet.

Call `ctx.context.sample` inside the tool. Pass a `sample` function to `createMCPServer`. Give `.server()` the type `MCPToolContext`, so `ctx.context.sample` type-checks.

```ts
import { toolDefinition } from '@tanstack/ai'
import { createMCPServer } from '@tanstack/ai-mcp/server'
import type { MCPToolContext } from '@tanstack/ai-mcp/server'
import { z } from 'zod'

const draftNote = toolDefinition({
  name: 'draft_note',
  description: 'Draft a short note about a topic',
  inputSchema: z.object({
    topic: z.string(),
  }),
}).server<MCPToolContext>(async (args, ctx) => {
  const draft = await ctx.context.sample({
    messages: [
      {
        role: 'user',
        content: `Write a short note about ${args.topic}.`,
      },
    ],
  })

  if (typeof draft !== 'string') {
    throw new Error('The sample result is not text.')
  }

  return draft
})

const server = createMCPServer({
  name: 'notes',
  version: '1.0.0',
  tools: [draftNote],
  sample: async (request) => {
    const first = request.messages[0]
    const content = first === undefined ? '' : first.content
    return `Draft: ${content}`
  },
})

export function handleMcp(request: Request) {
  return server.fetch(request)
}
```

`ctx.context.sample` is a method on the context of the tool. The `sample` function is `(request) => Promise<unknown>`.

## Spec 2025 and spec 2026

| Spec | Result |
| --- | --- |
| Spec 2025 | `ctx.context.sample` asks the MCP client. It does not call the `sample` function. |
| Spec 2026 | `ctx.context.sample` calls the `sample` function. It does not ask the client. |
| Spec 2026 with no `sample` | `ctx.context.sample` throws an Error. The message names `sample`. |

Call `draft_note` with a topic. The tool result is the draft text.
