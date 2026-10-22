---
title: Draft Text from a Tool
id: mcp-server-sample
order: 13
description: "Call ctx.context.sample from an MCP server tool, so the tool can ask a model for a draft and return it."
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

`sample` lets an MCP tool call a model for a draft, such as a short note. The tool itself has no model.

Call it as `ctx.context.sample` inside the tool.

## Quick setup

You need an MCP server first. If you do not have one, start with [Serve Tools over HTTP](./server).

1. Give `.server()` the type `MCPToolContext`, so `ctx.context.sample` type-checks.
2. Call `ctx.context.sample` with the messages for the model.
3. Pass a `sample` function to `createMCPServer`. It answers the sample request.

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

Call `draft_note` with a topic. The tool result is the draft text. In this example, the `sample` function returns `Draft:` plus the message. In your app, call your model there.

## How it works

- `ctx.context.sample` is a method on the context of the tool.
- The `sample` function has the type `(request) => Promise<unknown>`.
- Who answers depends on the MCP spec version of the client. See the table below.

## Advanced

### Spec 2025 and spec 2026

| Spec | Result |
| --- | --- |
| Spec 2025 | `ctx.context.sample` asks the MCP client. It does not call the `sample` function. |
| Spec 2026 | `ctx.context.sample` calls the `sample` function. It does not ask the client. |
| Spec 2026 with no `sample` | `ctx.context.sample` throws an Error. The message names `sample`. |

On spec 2025, the server can ask the client only when it keeps a session. Without a session, `ctx.context.sample` calls the `sample` function. See [MCP Server Sessions](./server-sessions).
