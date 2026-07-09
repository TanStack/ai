---
title: MCP Persistence
id: mcp-persistence
---

Use MCP persistence when your app needs durable MCP session metadata, tool-call
correlation, and replay/checkpoint events around a chat run. MCP does not add a
separate base persistence table system. It uses the same `AIPersistence` stores
as chat, tools, and other integrations.

By the end, you can keep MCP session ids and tool-call state recoverable without
putting MCP-only schema requirements into every persisted chat app.

## Persist the chat run first

Managed MCP tools run inside `chat()`, so start with the same run durability you
would use for a normal server-owned chat thread.

```ts
import {
  chat,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { createMCPClient } from '@tanstack/ai-mcp'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'

const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:.tanstack-ai/state.sqlite',
  migrate: true,
})

const weather = await createMCPClient({
  transport: { type: 'http', url: 'https://weather.example.com/mcp' },
})

export async function POST(request: Request) {
  const { messages, threadId, runId } = await request.json()

  const stream = chat({
    threadId,
    runId,
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    mcp: { clients: [weather] },
    middleware: [
      withChatPersistence(persistence, {
        features: ['messages', 'metadata'],
      }),
    ],
  })

  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
  })
}
```

MCP-specific state belongs in metadata when your app needs it. Making the
delivered stream reconnectable is a transport concern — see
[Delivery Durability](./delivery-durability).

## Store MCP session metadata

Use `stores.metadata` for app-owned correlation such as MCP server ids, session
ids, OAuth account ids, or last-seen resource versions.

```ts
import type { AIPersistence } from '@tanstack/ai-persistence'

async function rememberMcpSession(input: {
  persistence: AIPersistence
  threadId: string
  serverId: string
  sessionId: string
}) {
  const metadata = input.persistence.stores.metadata

  if (!metadata) {
    throw new Error('MCP session persistence requires stores.metadata.')
  }

  await metadata.set(`thread:${input.threadId}`, `mcp:${input.serverId}`, {
    sessionId: input.sessionId,
  })
}
```

Keep the value shape owned by your app. TanStack AI only requires the metadata
store methods; it does not prescribe an MCP session table.

## Store private MCP checkpoints

Use `stores.metadata` for private tool-call or session checkpoints that should
not surface to the UI. Metadata is app-owned key/value state scoped to a thread
or run.

```ts
import type { AIPersistence } from '@tanstack/ai-persistence'

async function recordMcpCheckpoint(input: {
  persistence: AIPersistence
  runId: string
  toolCallId: string
  serverId: string
}) {
  const metadata = input.persistence.stores.metadata

  if (!metadata) {
    throw new Error('MCP checkpoints require stores.metadata.')
  }

  await metadata.set(input.runId, `mcp:${input.toolCallId}`, {
    type: 'tool-call-observed',
    serverId: input.serverId,
  })
}
```

Use metadata for integration checkpoints and current lookup state.

## Coordinate MCP work across workers

Use `stores.locks` when more than one worker can resume or mutate the same MCP
session state. Use `stores.blobs` and `stores.artifacts` only when an MCP flow
produces durable files or media; generated media and file storage still require
both stores.

For backend choices, use [SQL Backends](./sql-backends), [Prisma](./prisma),
[Drizzle](./drizzle), or [Cloudflare](./cloudflare). For the full store method
contract and the `McpSessionStore` boundary, use
[Persistence Internals](./internals).
