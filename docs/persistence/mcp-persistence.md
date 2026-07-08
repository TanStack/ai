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
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { createMCPClient } from '@tanstack/ai-mcp'
import { withPersistence } from '@tanstack/ai-persistence'
import { postgresPersistence } from '@tanstack/ai-persistence-postgres'

const persistence = postgresPersistence({
  connectionString: process.env.DATABASE_URL ?? '',
})

const weather = await createMCPClient({
  transport: { type: 'http', url: 'https://weather.example.com/mcp' },
})

export async function POST(request: Request) {
  const { messages, threadId, runId, cursor } = await request.json()

  const stream = chat({
    threadId,
    runId,
    cursor,
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    mcp: { clients: [weather] },
    middleware: [
      withPersistence(persistence, {
        features: ['messages', 'durable-replay', 'metadata', 'internal-events'],
      }),
    ],
  })

  return toServerSentEventsResponse(stream)
}
```

Public replay events keep the UI reconnectable. MCP-specific state belongs in
metadata and internal events when your app needs it.

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

Use `stores.internalEvents` for private tool-call or session checkpoints that
should not replay to the UI as public AG-UI events.

```ts
import type { AIPersistence } from '@tanstack/ai-persistence'

async function recordMcpCheckpoint(input: {
  persistence: AIPersistence
  runId: string
  toolCallId: string
  serverId: string
}) {
  const internalEvents = input.persistence.stores.internalEvents

  if (!internalEvents) {
    throw new Error('MCP checkpoints require stores.internalEvents.')
  }

  const latestSeq = await internalEvents.latestSeq(input.runId, 'mcp')

  await internalEvents.append({
    runId: input.runId,
    expectedSeq: latestSeq,
    namespace: 'mcp',
    type: 'tool-call-observed',
    payload: {
      toolCallId: input.toolCallId,
      serverId: input.serverId,
    },
  })
}
```

Use public events only for user-visible stream replay. Use internal events for
integration checkpoints, and use metadata for current lookup state.

## Coordinate MCP work across workers

Use `stores.locks` when more than one worker can resume or mutate the same MCP
session state. Use `stores.blobs` and `stores.artifacts` only when an MCP flow
produces durable files or media; generated media and file storage still require
both stores.

For backend choices, use [SQL Backends](./sql-backends), [Prisma](./prisma),
[Drizzle](./drizzle), or [Cloudflare](./cloudflare). For the full store method
contract and the `McpSessionStore` boundary, use
[Persistence Internals](./internals).
