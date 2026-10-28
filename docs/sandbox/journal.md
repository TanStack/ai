---
title: The Run Journal (Advanced)
id: sandbox-journal
order: 12
description: "A sandboxed agent writes its output to a file inside the sandbox, not to a pipe. If your server dies during a run, any other server can read the whole run back from that file."
keywords:
  - run journal
  - readJournal
  - journalPaths
  - alignToStoredLog
  - killableProcesses
  - exitSentinelLine
  - awaitAttachableJournal
  - journal-stalled
---

The run journal writes each agent event to disk. A new server can read that log after the process that held the pipe exits.

Any server with the sandbox handle and the run id can read the whole run again, from the first byte.

## Turn on the journal

1. Pass both `runs` and `durability` to `withSandbox`. With only one of them, or neither, there is no journal and nothing warns you.
2. Forward the `runId` from the request to `chat()`. The journal path comes from it. Without it, a non-durable run gets a random id that no other server can compute.
3. Give the same durability adapter to the middleware and to the response.

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

// Local dev only. In production, every replica must reach the same stores.
// See ./takeover for the production wiring.
const { runs } = memoryPersistence().stores

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: [
      'npm install -g @anthropic-ai/claude-code --include=optional && claude --version',
    ],
    secrets: createSecrets({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    }),
  }),
})

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  // One adapter for the middleware and the response, so the journal and the
  // delivery log describe the same run.
  const adapter = memoryStream(request)

  const stream = chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages,
    threadId,
    // Required. A durable run without it throws DurableRunIdRequiredError.
    runId,
    // Both options, or there is no journal.
    middleware: [withSandbox(sandbox, { runs, durability: { adapter } })],
  })

  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

4. On the client, add nothing. `useChat` sends a new `runId` for every run, and `chatParamsFromRequest` reads it.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })

  return (
    <button onClick={() => sendMessage('Refactor the auth module')}>
      Send ({messages.length} messages)
    </button>
  )
}
```

Send a message. While the agent works, its output is in `/tmp/tanstack-runs/<runId>.ndjson` inside the sandbox.

> [!WARNING]
> Never reuse a `runId`. The journal is append-only, so a reused id appends to the old run's file. The second run then looks empty, or looks like it failed with the old exit code. Nothing throws. See [A runId must be unique per run](./journal-advanced#a-runid-must-be-unique-per-run).

## How it works

Each run gets two files in `/tmp/tanstack-runs`:

- `<runId>.ndjson`: every NDJSON event the agent prints.
- `<runId>.err`: the agent's stderr, kept separate so a CLI banner never mixes into the events.

The agent writes to a file, not a pipe. So when your server goes away, no reader disappears, and nothing sends the agent a `SIGPIPE`. The agent keeps working.

When the agent exits, the shell appends one exit line (the sentinel) to the journal. A reader that sees the sentinel knows the run is over, and it deletes both files.

Every read starts at a byte offset. A fresh read starts at 0. A read on another server, five minutes later, is the same call. [Takeover & Detached Runs](./takeover) builds on this. A new server reads the journal from byte 0, and it streams only what the client has not seen.

## Go deeper

To read a journal yourself, handle stalled reads, seed sentinels, or replay against a stored log, see [Run Journal Internals](./journal-advanced).
