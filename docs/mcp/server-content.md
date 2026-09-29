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
  argsSchema: z.object({ path: z.string() }),
}).read(async ({ path }) => ({ text: `The body of ${path}` }))

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

`read` returns `{ text }` for a text document. For a binary document, `read` returns `{ blob }` with a base64 string. Add `mimeType` to that object when one template serves files of different types.

For a `uriTemplate`, `read` gets the variables of the URI the host asked for, and the URI itself:

- `argsSchema.parse` runs first, so `read` gets the parsed variables. For `file:///notes.md`, `path` is `notes.md`.
- Without `argsSchema`, `read` gets the variables as strings.

## Prompts

`argsSchema.parse` runs first. Then `render` receives the parsed arguments.

`render` returns an array of messages. Each message has these fields:

- `role`: `user` or `assistant`.
- `content`: the message text.

If `role` is not `user` or `assistant`, the server sends that message as `user`.

## What the Host Gets

The host reads `file:///readme.md`. The `text` is `# Hello`.

The host reads `file:///notes.md`. The `text` is `The body of notes.md`.

The host starts from the `summarize` prompt with topic `weather`. The `role` is `user`. The `content` string is `weather`.
