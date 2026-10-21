---
title: Persistence Overview
id: overview
description: "Keep a chat after a page reload or on another device. Add one middleware on the server and one option on the client."
keywords:
  - persistence
  - durability
  - rehydrate conversation
  - page reload
  - server authoritative
  - client authoritative
---

Your user reloads the page and the conversation is gone, because it only lived in memory. Or they open the app on their phone and nothing is there.

Persistence fixes this. The server saves each thread, and `useChat` loads it back when the page opens.

## Quick setup

This setup keeps the chat on the server. It also lets a reply that was still streaming finish after a reload. It takes about five minutes.

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

The client half ships in the framework package you already use.

### 2. Create the persistence object

Make one object for the whole app. `memoryPersistence()` keeps everything in process memory, which is good for local development:

```ts
// persistence.ts
import { memoryPersistence } from '@tanstack/ai-persistence'

export const persistence = memoryPersistence()
```

### 3. Save and load on the server

Add `withPersistence` to your chat `POST`. Then add a `GET` on the same route:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeServerSentEventsResponse,
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
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
  })
}

export function GET(request: Request): Response | Promise<Response> {
  const durability = memoryStream(request)
  // A reply is still streaming: replay it from the log.
  if (durability.resumeFrom() !== null) {
    return resumeServerSentEventsResponse({ adapter: durability })
  }
  // Otherwise send back the stored thread.
  return reconstructChat(persistence, request, {
    // Without this check, anyone who guesses a thread id can read the thread.
    authorize: async (threadId, req) => ownsThread(req, threadId),
  })
}

async function ownsThread(request: Request, threadId: string): Promise<boolean> {
  void request
  void threadId
  return true // Replace with your session and ownership check.
}
```

### 4. Turn it on in the client

Give `useChat` a stable `threadId` and set `persistence: true`:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
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

Send a message, then reload the page. The conversation comes back. Reload while a reply streams, and the reply finishes in place.

> [!TIP]
> Your coding assistant can do this setup for you. After you install the package, run `npx @tanstack/intent@latest install` to add this package's [Agent Skills](../getting-started/agent-skills). Then ask it to "add chat persistence to this app".

## Keep the chat in the browser instead

If you do not want a server store, give `useChat` a browser storage adapter. You do not need steps 1, 2, or 3:

```tsx
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'

export function Chat() {
  const { messages } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: localStoragePersistence(),
  })
  return <p>{messages.length} messages</p>
}
```

This keeps the chat on one device only. [Client persistence](./client-persistence) compares the two modes and the storage adapters.

## How it works

- `withPersistence` saves the transcript, the run status, and any pending approvals to your stores.
- `persistence: true` tells `useChat` that the server owns the history. On mount, `useChat` calls your `GET` with the `threadId`.
- `reconstructChat` returns the stored messages. If a run is still streaming, it also returns that run. Then the client replays the run from the durability log.
- A second device follows the same path, because the `threadId` is the only key.

Before you go to production, do these two things:

1. Replace `memoryPersistence()` with an adapter for your database. See [Build your own adapter](./build-your-own-adapter).
2. Replace `memoryStream` with a log that all your server processes share. See [Resumable streams](../resumable-streams/overview).

## Which setup do I want?

| You want | Use |
| --- | --- |
| The chat to survive a reload on one device | A browser storage adapter |
| The same chat on another device, or after a server restart | The quick setup |
| A reload in the middle of a reply to finish the reply | The quick setup |
| A dropped connection to resume while the page stays open | [Resumable Streams](../resumable-streams/overview) alone |
| A human approval that can wait for days | The quick setup with an `interrupts` store. See [Chat persistence](./chat-persistence) |
| Sandbox files to come back after the provider sandbox is gone | [Keep Files After Reload](../sandbox/portable-snapshots-configure) |

## Generation and sandboxes

The same idea works outside chat:

- **Image, video, speech, and transcription.** The generation hooks take `persistence: true` too. See [Generation persistence](./generation-persistence). To keep the files after the provider links expire, see [Keep generated files](./keep-generated-files).
- **Sandboxed agents.** A run can outlive the tab, and another host can adopt it. See [Build a Sandbox Adapter](./build-a-sandbox-adapter) for what to store, and [Durable Runs](../sandbox/durable-runs) for the reasons.

When something surprises you, read [How persistence works](./internals). It explains threads, runs, who owns the history, and the middleware lifecycle.
