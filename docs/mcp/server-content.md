---
title: Serve Resources and Prompts
id: mcp-server-content
order: 13
description: "Serve documents and prompts from your MCP server, so a host can read a document or start from a prompt."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp server
  - resources
  - prompts
  - resourceDefinition
  - promptDefinition
  - createMCPServer
---

Your MCP server serves tools, but a host also wants to read your documents and start from your prompts. Until you serve them, the host cannot see them.

Define each document with `resourceDefinition` and each prompt with `promptDefinition`. Then pass them to `createMCPServer`.

## Quick setup

You need an MCP server first. If you do not have one, start with [Serve Tools over HTTP](./server).

1. Define a resource for each document.
2. Define a prompt for each prompt.
3. Pass `resources` and `prompts` to `createMCPServer`.

```ts
import {
  createMCPServer,
  promptDefinition,
  resourceDefinition,
} from '@tanstack/ai-mcp/server'
import { z } from 'zod'

const readme = resourceDefinition({
  name: 'readme',
  mimeType: 'text/markdown',
  uri: 'file:///readme.md',
}).read(async () => ({ text: '# Hello' }))

const file = resourceDefinition({
  name: 'file',
  mimeType: 'text/plain',
  uriTemplate: 'file:///{path}',
  argsSchema: z.object({ path: z.string() }),
}).read(async (_uri, { path }) => ({ text: `The body of ${path}` }))

const summarize = promptDefinition({
  name: 'summarize',
  description: 'Summarize a topic',
  argsSchema: z.object({ topic: z.string() }),
}).render(async (args) => [{ role: 'user', content: args.topic }])

const server = createMCPServer({
  name: 'library',
  version: '1.0.0',
  resources: [readme, file],
  prompts: [summarize],
})

export function handleMcp(request: Request) {
  return server.fetch(request)
}
```

Now the host gets these results:

- It reads `file:///readme.md`. The `text` is `# Hello`.
- It reads `file:///notes.md`. The `text` is `The body of notes.md`.
- It starts from the `summarize` prompt with the topic `weather`. It gets one message: the `role` is `user`, and the `content` is `weather`.

## How it works

A resource has one of two addresses:

- `uri`: one document, for example `file:///readme.md`.
- `uriTemplate`: a URI pattern for many documents, for example `file:///{path}`.

`read` returns the body of the document:

- `{ text }` for a text document.
- `{ blob }` with a base64 string for a binary document.

A prompt parses its arguments with `argsSchema`. Then `render` returns an array of messages. Each message has a `role` (`user` or `assistant`) and a `content` string.

## Serve one resource per item

A template such as `myapp://items/{itemId}/summary` serves many documents. The read must know which item the host asked for, and which user asks. A host also needs a list of the items that exist.

1. Read `itemId` from the `variables` argument of `read`.
2. Read the user from `ctx.context`.
3. Add `list` to return the real resources for `resources/list`.

```ts
import { createMCPServer, resourceDefinition } from '@tanstack/ai-mcp/server'

const summaries = new Map([
  ['1', 'First item'],
  ['2', 'Second item'],
])

const summary = resourceDefinition({
  name: 'item-summary',
  mimeType: 'text/plain',
  uriTemplate: 'myapp://items/{itemId}/summary',
  list: async () => ({
    resources: [...summaries.keys()].map((id) => ({
      uri: `myapp://items/${id}/summary`,
      name: `Item ${id}`,
    })),
  }),
}).read(async (uri, variables, ctx) => {
  const itemId = String(variables.itemId)
  const userId = String(ctx.context.userId)
  return { text: `${summaries.get(itemId) ?? 'Unknown'} (for ${userId})` }
})

const server = createMCPServer({
  name: 'items',
  version: '1.0.0',
  resources: [summary],
})

export function handleMcp(request: Request, userId: string) {
  return server.handle(request, { context: { userId } })
}
```

The host lists `Item 1` and `Item 2`. A read of `myapp://items/1/summary` returns `First item` plus the user id.

## Advanced

### The arguments of `read`

`read` gets three arguments:

- `uri`: the URI that the host asked for, as a `URL`.
- `variables`: the values from the template. A resource with `uri` gets `{}`. When the template has `argsSchema`, `argsSchema.parse` runs first, so `read` gets the parsed values. For `file:///notes.md`, `path` is `notes.md`.
- `ctx.context`: the values from `handle(request, { context })`, plus the verified token as `authInfo`. A tool gets the same values, plus `requestInput` and `sample`.

`list` gets the same `ctx`. It returns `{ resources }`, with a `uri` and a `name` for each resource. Only a resource with `uriTemplate` can have `list`.

### Resource rules

- If the resource has no `uri` and no `uriTemplate`, `resourceDefinition` throws `This resource has no uri and no uriTemplate. Pass a uri or a uriTemplate.`
- If you pass `uri` and `uriTemplate`, the server uses `uri`.
- When one template serves files of different types, add `mimeType` to the object that `read` returns.

### Prompt rules

- `argsSchema.parse` runs first. Then `render` receives the parsed arguments.
- If `role` is not `user` or `assistant`, the server sends that message as `user`.
