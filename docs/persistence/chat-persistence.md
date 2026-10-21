---
title: Chat Persistence
id: chat-persistence
---

Your chat lives in one request. When the process restarts, the transcript is gone, and so is any approval that was still waiting for an answer.

`withPersistence` is a chat middleware that fixes this. It writes each thread to a store you choose, so the server keeps the true copy of every conversation.

## Quick setup

### 1. Install the package

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-persistence
vue: @tanstack/ai-persistence
solid: @tanstack/ai-persistence
svelte: @tanstack/ai-persistence
preact: @tanstack/ai-persistence
angular: @tanstack/ai-persistence
vanilla: @tanstack/ai-persistence
octane: @tanstack/ai-persistence

<!-- ::end:tabs -->

### 2. Create the persistence object

Start with the in-memory backend. Replace it with your database adapter later:

```ts
// persistence.ts
import { memoryPersistence } from '@tanstack/ai-persistence'

export const persistence = memoryPersistence()
```

### 3. Add the middleware to the server route

Add `withPersistence` to `chat()`. Then add a `GET` that returns the stored thread:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { reconstructChat, withPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    // Forward the resume batch so a thread with pending interrupts continues.
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}

export function GET(request: Request): Promise<Response> {
  // Add `authorize` in a multi-user app. See Client persistence.
  return reconstructChat(persistence, request)
}
```

### 4. Load the thread in the client

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat({ threadId }: { threadId: string }) {
  const { messages, sendMessage } = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
    persistence: true,
  })
  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>{message.role}</div>
      ))}
      <button type="button" onClick={() => void sendMessage('hi')}>
        Send
      </button>
    </div>
  )
}
```

Send a message, then reload the page. The thread comes back from the server store. With a database adapter, it also comes back after a server restart.

[Client persistence](./client-persistence) covers the client side in full, including a reply that is still streaming.

> [!TIP]
> Run `npx @tanstack/intent@latest install` to give your coding assistant this package's [Agent Skills](../getting-started/agent-skills). The skills read your database setup and write the adapter to match. They also know the rules that are easy to get wrong, such as a full overwrite in `saveThread` and insert-if-absent creates for runs and interrupts.

## How it works

The middleware uses the stores that your backend has. There are no feature flags.

- `messages` (required): loads and saves the full model-message thread.
- `runs`: records the status of each run: running, interrupted, completed, failed, or aborted.
- `interrupts`: records pending tool approvals, client tools, and generic waits. Needs `runs`.

`withPersistence` writes at these moments:

1. **Start of a run.** It saves the new user message, so a reload during generation still shows the question.
2. **Interrupt.** It saves the new interrupt records and marks the run `interrupted`.
3. **Finish.** It saves the full transcript, then marks the run `completed`.

On an error, the run is marked `failed`. On an abort, the run is marked `aborted`.

Before you go to production:

1. Replace `memoryPersistence()` with an adapter for your database. [Build your own adapter](./build-your-own-adapter) walks through a complete SQLite version.
2. Apply the schema through your deploy workflow, not when the adapter opens. See [Migrations](./migrations).

## Threads, runs, and turns

The transcript is stored per `threadId`. Each run gets a `runs` record with its status, timings, and the usage that the provider reported.

So a client that reconnects never has to send a run id. The store finds the live run of the thread with `findActiveRun(threadId)`, and the client follows that run.

[Id map](./id-map) explains how to choose a thread id. [How persistence works](./internals) has the full model.

## Interrupts survive a restart

A run can pause on an interrupt: a tool approval, a client-side tool, or a generic middleware request. The middleware records it in the `interrupts` store.

The next request on that thread must carry a `resume` batch that answers the pending interrupts. If it does not, the middleware rejects the request. That is why the route forwards `params.resume`.

The answers are committed only when the run reaches the next interrupt or finishes. If the run fails first, the interrupts stay pending, and the user can answer them again.

## Choose which stores to run

Each store is independent, so give the backend only the stores you need. [Controls](./controls) shows how to mix backends per store.

## Advanced

These topics are on [Chat persistence: advanced](./chat-persistence-advanced):

- Subagent cards and AG-UI activity rows after a reload.
- How incoming messages merge with the stored thread.
- Compaction, streaming snapshots, and structured output.
- The full run and interrupt lifecycles, including detached runs.
