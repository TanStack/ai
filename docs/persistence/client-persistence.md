---
title: Client Persistence
id: client-persistence
---

Client persistence writes `useChat` messages to storage in the browser. A reload keeps the conversation and a reply that was still streaming.

On reload, the `persistence` option also brings back a pending approval.

## Quick setup

Pick who owns the history. Then copy that path.

### The browser owns the chat

Use this for a single-page app, an offline-first app, or any app with no server store. Pass a storage adapter and a stable `threadId`:

```tsx
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'

export function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: localStoragePersistence(),
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

`localStoragePersistence()` needs no type argument and no codec. It uses the chat record shape and a JSON codec by default.

Send a message and reload. The conversation is there, with no network call.

### The server owns the chat

Use this for large transcripts, for the same chat on more than one device, or to keep message content out of the browser. You need [Chat persistence](./chat-persistence) on the server first.

1. Set `persistence: true` in the client:

   ```tsx
   import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

   export function Chat({ threadId }: { threadId: string }) {
     const { messages, isHydrating, sendMessage } = useChat({
       threadId,
       connection: fetchServerSentEvents('/api/chat'),
       persistence: true,
     })
     if (isHydrating) return <p>Loading conversation...</p>
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

2. Add a `GET` next to your chat `POST`:

   ```ts
   import { memoryStream, resumeServerSentEventsResponse } from '@tanstack/ai'
   import { reconstructChat } from '@tanstack/ai-persistence'
   import { persistence } from './persistence'

   export function GET(request: Request): Response | Promise<Response> {
     const durability = memoryStream(request)
     // A reconnecting client sends a resume cursor. Replay the log.
     if (durability.resumeFrom() !== null) {
       return resumeServerSentEventsResponse({ adapter: durability })
     }
     // Otherwise return the stored thread, plus any run that still streams.
     return reconstructChat(persistence, request, {
       // Without this, anyone who guesses a thread id gets the transcript.
       authorize: async (threadId, req) => ownsThread(req, threadId),
     })
   }

   async function ownsThread(request: Request, threadId: string): Promise<boolean> {
     void request
     void threadId
     return true // Replace with your session and ownership check.
   }
   ```

The replay branch works only when your `POST` records the stream. To record it, pass `{ durability: { adapter: memoryStream(request) } }` to `toServerSentEventsResponse` in the `POST`. The [overview quick setup](./overview#quick-setup) shows the full route.

Reload the page. `useChat` loads the thread from the server. Open the same `threadId` on another device, and you get the same chat.

You do not fetch or seed the transcript yourself. You need no loader and no `initialMessages`. The `threadId` is the stable key, and the server finds everything from it.

## Pick a stable thread id

The `threadId` is the key that the record is saved under. A new id on each mount restores nothing. Take it from your own data, for example a conversation id or a route param. [Id map](./id-map) explains how to choose one, and how it differs from the `runId` that the hook reports.

## What a reload restores

- **The transcript.** It shows again from storage or from the server.
- **A pending interrupt.** An approval prompt comes back as it was.
- **A reply that was still streaming.** It finishes in place. This needs a durability-backed connection: a route that records the stream and has a replay handler. See [Resumable streams](../resumable-streams/overview).

Replay rebuilds reasoning, tool activity, and text from the durable log. This includes runs that emit reasoning before their first tool or text event. The completed activity stays in the transcript that the next message sends.

## Choose a mode

`persistence` takes a storage adapter or a boolean:

| Value | Who owns the history | What the client caches | Use it for |
| --- | --- | --- | --- |
| A storage adapter | The client | The transcript and a resume pointer | Single-page and offline apps, one device, small to medium history |
| `true` | The server | Nothing | Large histories, many devices, no transcripts in the browser |
| `false` or omitted | Nobody | Nothing | A chat that can start empty after a reload |

The generation hooks take the same option, but as a boolean only. See [Generation persistence](./generation-persistence).

Client and server persistence are independent:

- Client persistence restores what one browser showed.
- Server persistence ([Chat persistence](./chat-persistence)) keeps the true copy for every user, and survives a server restart.

For the setup that most apps use, see [Which setup do I want?](./overview#which-setup-do-i-want).

## Choose a storage backend

Three adapters ship in `@tanstack/ai-client`. Every framework package exports them again. They all have the same shape:

| Adapter | How long it keeps data | Notes | Use it for |
| --- | --- | --- | --- |
| `localStoragePersistence` | Across reloads and browser restarts | Synchronous, about 5MB quota, JSON codec | The default: keep a conversation for next time |
| `sessionStoragePersistence` | One tab, until the tab closes | Same shape as localStorage | A chat that must not outlive the tab |
| `indexedDBPersistence` | Across reloads and restarts | Async, structured clone (a `Date` comes back exactly), room for large data | Big transcripts, or values that a JSON codec changes |

```tsx
import { indexedDBPersistence } from '@tanstack/ai-react'

const persistence = indexedDBPersistence()
```

Each adapter throws only when you use it and its browser store is missing, for example during server-side rendering. So you can create one on the server safely.

## Advanced

### Page a long thread

With `persistence: true`, `history: { pageSize }` loads only the newest messages on hydrate. Call `loadOlderMessages()` for more:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

const connection = fetchServerSentEvents('/api/chat')

function Chat({ threadId }: { threadId: string }) {
  const {
    messages,
    isHydrating,
    hasOlderMessages,
    loadOlderMessages,
    sendMessage,
  } = useChat({
    threadId,
    connection,
    persistence: true,
    history: { pageSize: 50 },
  })
  if (isHydrating) return <p>Loading conversation...</p>
  return (
    <div>
      {hasOlderMessages ? (
        <button
          type="button"
          onClick={() => {
            void loadOlderMessages().catch(() => {
              // Show a retry. The messages on screen stay.
            })
          }}
        >
          Load older
        </button>
      ) : null}
      {messages.map((m) => (
        <div key={m.id}>{m.role}</div>
      ))}
      <button type="button" onClick={() => void sendMessage('hi')}>
        Send
      </button>
    </div>
  )
}
```

The library does not watch the scrollbar. Call `loadOlderMessages()` from your own scroll handler.

- `history` is valid only with `persistence: true`. Without `history`, hydrate loads the full thread.
- `hasOlderMessages` follows `page.truncated` from the last hydrate or older-page response.
- With `history.pageSize`, a send posts only the new turn. A reload posts the last user message, because the old assistant message is already gone in the client. A resume posts from that user message through the assistant message on screen, so the stored tool call stays.
- If `loadOlderMessages()` fails, the promise rejects, the messages on screen stay, and `hasOlderMessages` stays `true`. Catch the rejection in your UI.

### Loading state

`isHydrating` is `true` from the first render until the transcript is in place.

- If a run still generates, `isLoading` is already `true` when `isHydrating` turns `false`.
- If the load fails, `isHydrating` turns `false` and `error` is set.

When the transcript appears depends on the adapter and the framework:

- A direct `ChatClient` and most framework wrappers load sync adapters (`localStorage`, `sessionStorage`) during construction.
- React is different. The first committed render uses `initialMessages` and `initialResumeSnapshot`, and browser persistence applies after the hook attaches. This keeps the server snapshot stable during SSR hydration.
- IndexedDB always loads asynchronously, after the database opens.

### What `reconstructChat` returns

`reconstructChat` returns a JSON body with these fields:

- `messages`: the transcript as UI messages.
- `activeRun`: `{ runId }` when a run still generates for the thread, else `null`. The client follows it through the replay branch of the `GET`.
- `interrupts`: the pending interrupts and the run they paused, else `null`. Needs an `interrupts` store.
- `page`: `{ truncated, cursor }`, only when the request has a valid `limit` query param. `reconstructChat` reads `limit` and `before` from the query.

You never handle a run id. A second device resumes the live run the same way the first tab does.

### Show how long each turn took

A live turn can time itself on the client. After a reload, that time is gone. Pass `includeRuns: true` to get it back from the server:

```ts
import { reconstructChat } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export function GET(request: Request): Promise<Response> {
  return reconstructChat(persistence, request, { includeRuns: true })
}
```

Each assistant message of a finished run then has the run timings, in epoch ms, on `metadata.tanstack.run`:

```tsx
import type { UIMessage } from '@tanstack/ai'

function TurnDuration({ message }: { message: UIMessage }) {
  const run = message.metadata?.tanstack?.run
  if (!run?.finishedAt) return null
  const seconds = Math.round((run.finishedAt - run.startedAt) / 1000)
  return <span>Worked for {seconds}s</span>
}
```

The response also has a top-level `runs` list with `runId`, `status`, `startedAt`, and `finishedAt` for each finished run. The timings need:

- A `runs` store that implements `listByThread`.
- Messages that `withPersistence` saved with this version or later.

### AG-UI activity rows

AG-UI activity events show as `role: 'activity'` rows in `messages`.

- A client storage adapter keeps each row with the same `id` and content.
- `persistence: true` restores the rows from the server only when the server has an `activities` store. See [AG-UI activity rows on reload](./chat-persistence-advanced#ag-ui-activity-rows-on-reload).

The next `sendMessage` does not send activity rows as model input.

### Handle restored client tools

A live client tool runs when its call arrives from the stream. Hydration restores its pending execution, but it does not run the browser code again, because that work is not always safe to repeat. The execution stays an internal interrupt, and it is not in `interrupts`.

Use `onInterruptStateChange` to tell restored interrupt state from live updates. By default, a restored batch stays pending. This example cancels every restored batch:

```tsx
import { useEffect, useState } from 'react'
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'

function Chat() {
  const [restoredBatch, setRestoredBatch] = useState(false)
  const { cancelInterrupts } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: localStoragePersistence(),
    onInterruptStateChange(_state, { source }) {
      setRestoredBatch(source === 'hydrate')
    },
  })

  useEffect(() => {
    if (restoredBatch) cancelInterrupts()
  }, [cancelInterrupts, restoredBatch])

  return null
}
```

- `source` is `hydrate` for state from an initial resume snapshot, a client storage adapter, or server hydration.
- `source` is `live` for streamed changes and changes that the client starts.

`cancelInterrupts()` cancels the full internal batch. That includes visible approvals and hidden client-tool executions. It cannot cancel only one kind of interrupt.

### Write your own storage adapter

Any object with `getItem`, `setItem`, and `removeItem` works. The record is one `{ messages, resume? }` object per chat id: the transcript, plus the pointer that lets a reload rejoin a running reply. So `setItem` gets that full record, not a bare message array:

```ts
import type {
  ChatClientPersistence,
  ChatPersistedState,
} from '@tanstack/ai-client'

function isPersistedState(value: unknown): value is ChatPersistedState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'messages' in value &&
    Array.isArray(value.messages)
  )
}

const persistence: ChatClientPersistence = {
  getItem(id) {
    const raw = localStorage.getItem(id)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    // Wrap a bare message array saved by a 0.x app.
    if (Array.isArray(parsed)) return { messages: parsed }
    return isPersistedState(parsed) ? parsed : null
  },
  setItem(id, state) {
    localStorage.setItem(id, JSON.stringify(state))
  },
  removeItem(id) {
    localStorage.removeItem(id)
  },
}
```

> [!WARNING]
> Reads are best effort. If `getItem` throws or returns `null`, the client treats it as "nothing stored". So an adapter that parses the wrong shape fails **silently**, and the conversation does not come back. Do one real reload with your adapter before you ship it.
