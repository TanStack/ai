---
title: Serve Resources and Prompts
id: mcp-server-content
order: 13
description: "Serve documents and prompts from your MCP server so a host can read a document or start from a prompt."
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

Until you serve a resource, a host cannot read your document. Until you serve a prompt, a host cannot start from that prompt.

## Define Resources and Prompts

1. Define each document with `resourceDefinition`.
2. Define each prompt with `promptDefinition`.
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
}).read(async () => ({ text: 'file body' }))

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

## Resources

A resource must have `uri` or `uriTemplate`.

- `uri`: one document. An example is `file:///readme.md`.
- `uriTemplate`: a URI pattern. An example is `file:///{path}`.

If the resource has no `uri` and no `uriTemplate`, `resourceDefinition` throws `This resource has no uri and no uriTemplate. Pass a uri or a uriTemplate.`

If you pass `uri` and `uriTemplate`, the server uses `uri`.

`read` returns `{ text }` for a text document. For a binary document, `read` returns `{ blob }` with a base64 string.

## Serve One Resource per Item

A template such as `myapp://items/{itemId}/summary` serves many documents. The read must know which item the host asked for, and which user asks. A host also needs a list of the items that exist.

1. Read `itemId` from the `variables` argument of `read`.
2. Read the user from `ctx.context`.
3. Add `list` to return the concrete resources for `resources/list`.

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

`read` gets three arguments:

- `uri`: the URI the host asked for, as a `URL`.
- `variables`: the values from the template. A resource with `uri` gets `{}`.
- `ctx.context`: the values from `handle(request, { context })`, plus the verified token as `authInfo`. A tool gets the same values, plus `requestInput` and `sample`.

`list` gets the same `ctx`. It returns `{ resources }`, with a `uri` and a `name` for each resource. Only a resource with `uriTemplate` can have `list`.

## Prompts

`argsSchema.parse` runs first. Then `render` receives the parsed arguments.

`render` returns an array of messages. Each message has these fields:

- `role`: `user` or `assistant`.
- `content`: the message text.

If `role` is not `user` or `assistant`, the server sends that message as `user`.

## What the Host Gets

The host reads `file:///readme.md`. The `text` is `# Hello`.

The host starts from the `summarize` prompt with topic `weather`. The `role` is `user`. The `content` string is `weather`.
