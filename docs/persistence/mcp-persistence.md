---
title: MCP Persistence
id: mcp-persistence
---

# MCP Persistence

MCP does not define a separate persistence backend or event log. MCP tools run
inside the normal chat lifecycle, so messages, runs, and interrupts use the
same `AIPersistence` stores as any other chat. App-owned MCP session and OAuth
correlation can use `metadata`.

## Persist an MCP-backed chat

```ts
// app/api/chat/route.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/mcp.sqlite',
  migrate: true,
})

const weather = await createMCPClient({
  transport: { type: 'http', url: 'https://weather.example.com/mcp' },
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    mcp: { clients: [weather] },
    middleware: [withChatPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

The client uses the normal chat API:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function McpChat() {
  const chat = useChat({
    threadId: 'weather-thread',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <button onClick={() => void chat.sendMessage('Will it rain tomorrow?')}>
      Ask
    </button>
  )
}
```

No feature list is required. Message, run, and interrupt behavior follows the
stores present on `persistence`.

## Store app-owned MCP metadata

```ts
import type { AIPersistence } from '@tanstack/ai-persistence'

export async function rememberMcpSession(input: {
  persistence: AIPersistence
  threadId: string
  serverId: string
  sessionId: string
}) {
  const metadata = input.persistence.stores.metadata
  if (!metadata) {
    throw new Error('MCP session persistence requires stores.metadata.')
  }

  await metadata.set(
    `thread:${input.threadId}`,
    `mcp:${input.serverId}`,
    { sessionId: input.sessionId },
  )
}
```

TanStack AI does not prescribe the metadata value schema. Version values that
must survive application upgrades, and avoid storing access tokens unless the
backend and retention policy are designed for secrets.

## Coordinate concurrent session changes

Use `locks` when more than one worker can refresh or mutate the same remote MCP
session. Use `artifacts` and `blobs` only when MCP tools produce durable files
or media. Artifact metadata and bytes remain separate.

Making MCP chat SSE replayable is a transport concern (resumable streams,
configured on `toServerSentEventsResponse`); it is not an MCP state store.
