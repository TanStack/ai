---
title: Sandbox Persistence
id: sandbox-persistence
---

# Sandbox Persistence

Sandbox persistence covers sandbox instance metadata used to resume a provider
sandbox across runs.

`withSandbox` reads persistence supplied by an earlier
`withChatPersistence(...)` middleware: when the persistence exposes a
`metadata` store, sandbox records (provider sandbox id, latest snapshot id,
workspace key) are stored there, so a later run on the same thread resumes the
existing sandbox instead of creating a new one. Without persistence, an
in-memory store is used and resume works only within the same process.

## Add persistence before sandbox middleware

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'
import { withSandbox } from '@tanstack/ai-sandbox'
import { repoSandbox } from './repo-sandbox'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/sandbox.sqlite',
  migrate: true,
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [
      withChatPersistence(persistence),
      withSandbox(repoSandbox),
    ],
  })

  return toServerSentEventsResponse(stream)
}
```

The React client remains a normal chat client:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function CodingChat() {
  const chat = useChat({
    threadId: 'coding-thread',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <button onClick={() => void chat.sendMessage('Update the README')}>
      Run
    </button>
  )
}
```

## Workspace file durability

Provider snapshots (`lifecycle: { snapshot: 'after-run' }`) remain the way to
preserve a sandbox's disk state between runs on providers that support them.
Storing changed workspace files in your own persistence backend (per-file
checkpoints restored into a fresh sandbox) depends on artifact/blob storage
and lands in a follow-up release.

## Delivery is not sandbox persistence

Sandbox persistence does not make chat output replayable. Reconnecting to an
in-flight run is a separate transport-layer feature (stream re-attach /
delivery durability, landing in PR #955). Sandbox file events remain canonical
stream chunks; persistence does not create a second event stream.
