---
title: Connect clients to a harness
id: harness-connect
order: 2
description: "Serve a harness session over HTTP, SSE, or WebSocket. Talk to it from a web app, an editor over ACP, or another chat() call."
keywords:
  - tanstack ai
  - harness
  - AG-UI
  - ACP
  - websocket
  - harnessText
---

Your harness runs on a server, but the people who use it are in a browser, an editor, or another agent. `createHarnessHandler` serves a session over HTTP. A web app talks to it with `createHarnessClient`, an editor with ACP, and another `chat()` call with `harnessText`.

## Serve the session over HTTP

Mount one fetch handler on a route. `authorize` is required, so no endpoint is open by accident.

```ts group=harness-connect
import { defineHarness, createHarnessHandler, createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

export const handler = createHarnessHandler({
  host,
  harness: assistant,
  authorize: (request) =>
    request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
      ? { id: 'user-1' }
      : null,
  canAccess: (principal, threadId) => threadId.startsWith(principal.id),
})
```

The handler answers these paths under your route:

- `GET capabilities`: the AG-UI capabilities, with the agents in `expose.agents`.
- `POST run`: standard AG-UI. One request runs one prompt and streams it as SSE. Any AG-UI client works.
- `GET events?threadId=`: every event of the session as SSE. Each event id is a cursor, so a reconnect with `Last-Event-ID` continues where it stopped.
- `POST control`: send `{ threadId, input }`, for example `{ op: 'prompt', message }`. You get a receipt back.
- `GET snapshot?threadId=`: the status, running operations, and waiting approvals.

## Talk to it from a web app

`createHarnessClient` wraps those endpoints. Import the harness with `import type`, so no server code reaches the browser.

```ts group=harness-connect-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { assistant } from './harness'

const client = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'user-1-thread',
  headers: { authorization: 'Bearer my-token' },
})

await client.prompt('Summarize my open tickets.')

for await (const entry of client.events()) {
  if (entry.event.type === 'TEXT_MESSAGE_CONTENT') {
    console.log(entry.event.delta)
  }
}
```

`events()` reconnects after a network error and continues from the last cursor. A second tab, a phone, or a reload all see the same session.

## Use a WebSocket

For one connection that carries events and inputs, authorize the upgrade, then hand the socket to `handleHarnessSocket`:

```ts group=harness-connect
import { handleHarnessSocket } from '@tanstack/ai-harness'
import type { WebSocketLike } from '@tanstack/ai'

export function onUpgrade(socket: WebSocketLike) {
  handleHarnessSocket({ host, harness: assistant, socket, principal: { id: 'user-1' } })
}
```

The client sends `{ type: 'harness.subscribe', threadId }` first. After that, each `harness.input` frame gets a `harness.receipt`, and every event arrives as a `harness.event` frame with its cursor.

## Use it from an editor (ACP)

Editors such as Zed start agents as a process and talk ACP over stdio. `serveAcp` makes the harness an ACP v2 agent:

```ts group=harness-connect
import { serveAcp } from '@tanstack/ai-acp/agent'

serveAcp({ host, harness: assistant })
```

Tool approvals become permission requests in the editor. ACP v2 is still a draft, so this API is experimental.

## Use it as the model of another chat

`harnessText` turns a harness into a text adapter. The outer chat sends a message, and the harness runs a full turn with its own tools, plugins, and agents:

```ts group=harness-connect
import { chat } from '@tanstack/ai'
import { harnessText } from '@tanstack/ai-harness'

const stream = chat({
  adapter: harnessText(assistant, { host }),
  messages: [{ role: 'user', content: 'Fix the failing test.' }],
  threadId: 'outer-thread',
})
```

Each outer thread gets its own inner session, so the harness keeps its own history.

## What you have now

- One handler that serves standard AG-UI and the session stream.
- A typed web client that reconnects and resumes from a cursor.
- A WebSocket, an ACP agent for editors, and a harness you can call from `chat()`.

Next: run the same harness in a terminal with the [CLI](./cli).
