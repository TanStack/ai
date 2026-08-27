---
title: Persistence Overview
id: overview
description: "Set up persistence for chat, generation and sandboxes: one server route, one client option. Copy the snippets, then read the details only if you need them."
keywords:
  - persistence
  - durability
  - rehydrate conversation
  - page reload
  - server authoritative
  - client authoritative
---

# Persistence

Your user reloads the page and the conversation is gone, because it only ever lived
in memory. Or they open the app on their phone and none of it is there. Persistence
fixes both, and it is two snippets: one middleware on the server, one option on the
client.

There is a second, separate problem: the socket drops while a reply is still
streaming. That is [Resumable Streams](../resumable-streams/overview), a different
layer you can add on its own. Step 3 below combines them, which is what most apps
end up wanting.

When the provider sandbox is gone, the workspace files can also disappear. Use
the same persistence object with
[Keep Files After Reload](../sandbox/portable-snapshots-configure).

## Install

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

The client half needs no install. It ships in the framework package you already use
(`@tanstack/ai-react`, `-vue`, `-solid`, `-svelte`, `-angular`, or
`@tanstack/ai-client`).

Wire this package's [Agent Skills](../getting-started/agent-skills) into your coding
assistant before you write any of it, then ask it for "add chat persistence to this
app":

```bash
npx @tanstack/intent@latest install
```

Run that after the package is installed. Intent scans `node_modules`, so anything
added later needs another run.

## 1. Server: store the conversation

`withPersistence` writes the transcript, run status and any pending approvals into
your own store. `persistence` here is your adapter;
[build one](./build-your-own-adapter) in about 40 lines, or start with
`memoryPersistence()` for local dev.

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

## 2. Client: bring it back

Two forms, and the choice is only about who owns the history:

- **`persistence: true`** puts the server in charge. The browser caches nothing and
  asks the server for the thread on mount. Best for multi-user and multi-device apps.
- **`persistence: <adapter>`** puts the browser in charge, with
  `localStoragePersistence()`, `sessionStoragePersistence()` or
  `indexedDBPersistence()`. No server store needed.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: true,
    // Or keep the transcript in the browser instead:
    // persistence: localStoragePersistence(),
  })
  return <button onClick={() => sendMessage('hi')}>{messages.length}</button>
}
```

With `persistence: true` the client needs one `GET` to read from, which is step 3.
With a storage adapter you are done: reload and the conversation is there.

## 3. Survive a reload mid-answer

Add a `GET` to the same route. It does two jobs, and the `if` picks one per request:
replay a run that is still streaming, or hand back the stored transcript.

```ts
import {
  chatParamsFromRequest,
  memoryStream,
  resumeServerSentEventsResponse,
} from '@tanstack/ai'
import { reconstructChat } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export function GET(request: Request): Response | Promise<Response> {
  const durability = memoryStream(request)
  // A run still in flight: the client sent a resume offset, so replay its log.
  if (durability.resumeFrom() !== null) {
    return resumeServerSentEventsResponse({ adapter: durability })
  }
  // Otherwise return the stored thread, plus a cursor to any run still generating.
  return reconstructChat(persistence, request, {
    // WITHOUT this, anyone who guesses a thread id gets the whole transcript.
    authorize: async (threadId, req) => ownsThread(req, threadId),
  })
}

async function ownsThread(request: Request, threadId: string): Promise<boolean> {
  void request
  void threadId
  return true // replace with your session and ownership check
}
```

`useChat` drives both halves for you. On mount it fetches the transcript, and if the
server reports a run still generating, it tails that run and the reply finishes in
place. Nothing else to wire, and a second device follows the identical path.

To make the `POST` resumable too, hand the same adapter to the response:
`toServerSentEventsResponse(stream, { durability: { adapter: memoryStream(request) } })`.

## Generation and sandboxes use the same idea

- **Generation** (image, video, speech, transcription): the hooks take a
  `persistence` option too, boolean only, backed by a `generationRuns` store. See
  [Generation persistence](./generation-persistence), and
  [Keep generated files](./keep-generated-files) to hold the bytes after the
  provider's URLs expire.
- **Sandboxed agents**: a run can outlive the tab and be adopted by another host.
  See [Build a Sandbox Adapter](./build-a-sandbox-adapter) for what to
  store, and [Durable Runs](../sandbox/durable-runs) for why.

## Which setup do I want?

| You want | Turn on |
| --- | --- |
| The conversation to survive a reload, nothing more | Step 2 with a storage adapter |
| The same conversation on another device, or after a server restart | Steps 1 and 2 with `persistence: true` |
| A reload mid-answer to pick the answer back up | Steps 1, 2 and 3 |
| A dropped socket to resume with the page still open | [Resumable Streams](../resumable-streams/overview) alone |
| To pause for a human approval and resume it days later | Step 1 with an `interrupts` store |
| Sandbox files to come back after the provider sandbox is gone | [Keep Files After Reload](../sandbox/portable-snapshots-configure) |

## Where to go next

- [Chat persistence](./chat-persistence): the server middleware in full, including
  durable interrupts.
- [Client persistence](./client-persistence): the modes, storage backends, and what a
  reload restores in each case.
- [Build your own adapter](./build-your-own-adapter): implement the stores against
  your database and prove them with the conformance suite.
- [Controls](./controls): compose backends per store.
- [How persistence works](./internals): the two layers, thread and run identity, who
  owns history, and the middleware lifecycle. Read it when something surprises you.
