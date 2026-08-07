---
title: Persistence Overview
id: overview
description: "Chat, generation, sandboxes: middleware on the server, one client option. Copy the snippets."
keywords:
  - persistence
  - durability
  - rehydrate conversation
  - page reload
  - server authoritative
  - client authoritative
---

# Persistence

If you need a conversation that survives reload (and multi-device) → steps 1–2.
If you also need mid-stream resume after reload → step 3.
Socket drop with the page still open is [Resumable Streams](../resumable-streams/overview), a separate layer.

## Install

```bash
pnpm add @tanstack/ai-persistence
```

Client half ships in `@tanstack/ai-react` (and vue/solid/svelte/angular/`ai-client`). No extra install.

Optional: wire [Agent Skills](../getting-started/agent-skills), then ask for "add chat persistence":

```bash
npx @tanstack/intent@latest install
```

Run after install. Intent scans `node_modules`; re-run when you add packages.

## 1. Server: store the conversation

`withPersistence` writes transcript, run status, and pending approvals. Point it at your adapter ([build one](./build-your-own-adapter) ~40 lines, or `memoryPersistence()` for local dev).

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

## 2. Client: restore it

| Mode | Who owns history | When |
| --- | --- | --- |
| `persistence: true` | Server. Browser caches nothing; hydrates by `threadId` on mount | Multi-user, multi-device |
| `persistence: <adapter>` | Browser (`localStoragePersistence()`, `sessionStoragePersistence()`, `indexedDBPersistence()`) | SPA / offline, no server store |

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: true,
    // Or browser-owned:
    // persistence: localStoragePersistence(),
  })
  return <button onClick={() => sendMessage('hi')}>{messages.length}</button>
}
```

`persistence: true` needs the `GET` in step 3. A storage adapter is enough alone: reload restores the thread.

## 3. Survive a reload mid-answer

One `GET` on the same route: replay an in-flight run, or return the stored transcript.

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
  if (durability.resumeFrom() !== null) {
    return resumeServerSentEventsResponse({ adapter: durability })
  }
  return reconstructChat(persistence, request, {
    // Without this, anyone who guesses a thread id gets the transcript.
    authorize: async (threadId, req) => ownsThread(req, threadId),
  })
}

async function ownsThread(request: Request, threadId: string): Promise<boolean> {
  void request
  void threadId
  return true // replace with session + ownership check
}
```

`useChat` drives both: on mount it fetches the transcript; if a run is still generating, it tails it. For resumable `POST`, pass the same adapter: `toServerSentEventsResponse(stream, { durability: { adapter: memoryStream(request) } })`.

## Generation and sandboxes

| Surface | What to do |
| --- | --- |
| Generation (image/video/speech/transcription) | `persistence: true` on the hook + `generationRuns` store → [Generation persistence](./generation-persistence). Bytes after provider URLs expire → [Keep generated files](./keep-generated-files) |
| Sandboxed agents | Runs can outlive the tab → [Build a Sandbox Adapter](./build-a-sandbox-adapter), [Durable Runs](../sandbox/durable-runs) |

## Which setup?

| You want | Turn on |
| --- | --- |
| Survive reload only | Step 2 with a storage adapter |
| Same thread on another device / after server restart | Steps 1–2 with `persistence: true` |
| Reload mid-answer picks up | Steps 1–3 |
| Dropped socket, page still open | [Resumable Streams](../resumable-streams/overview) alone |
| Human approval, resume days later | Step 1 with an `interrupts` store |

## Next

- [Chat persistence](./chat-persistence) — server middleware, durable interrupts
- [Client persistence](./client-persistence) — modes, backends, reload behavior
- [Build your own adapter](./build-your-own-adapter) — stores + conformance suite
- [Controls](./controls) — compose backends per store
- [How persistence works](./internals) — layers, identity, lifecycle (when something surprises you)
