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
- `POST run`: standard AG-UI. One request runs one prompt and streams it as SSE. The prompt keeps every content part of the last user message, for example an image. `useChat` works with it. See [Use it from useChat](#use-it-from-usechat).
- `GET run?threadId=`: the saved messages, the running turn, and the waiting approvals, for a `useChat` that loads the thread after a reload.
- `GET run?runId=`: the turn with that run id as SSE, from its first event. A reloaded `useChat` joins a running turn with it.
- `GET events?threadId=`: every event of the session as SSE. Each event id is a cursor, so a reconnect with `Last-Event-ID` continues where it stopped.
- `POST control`: send `{ threadId, input }`, for example `{ op: 'prompt', message }`. You get a receipt back. Agents, settings, config keys, and commands need `expose`. See [Choose what clients can change](#choose-what-clients-can-change).
- `GET snapshot?threadId=`: the status, running operations, and waiting approvals.

## Choose what clients can change

A client can send a prompt and answer questions. Other inputs can change how the session works, so a client can use only what the harness exposes. Nothing is exposed by default.

Name what a client can use in `expose`:

```ts group=harness-connect
import { permissions, todos } from '@tanstack/ai-harness/plugins'

export const team = defineHarness({
  name: 'acme/team-assistant',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [permissions(), todos()],
  expose: { settings: ['instructions'], commands: ['todos'] },
})
```

| Field | What a client can do |
| --- | --- |
| `agents` | Run these agents, for example with `client.agents.<name>.start(input)`. |
| `settings` | Change these [thread settings](./thread-settings) with `client.configure(settings)`. |
| `config` | Set these plugin config keys with `client.setConfig(key, value)`. |
| `commands` | Run these commands with `client.command(name)`, or with `/name` in a [session view](./custom-ui) on a client. |

- Any other input of these kinds gets `{ status: 'rejected', reason: 'not_exposed' }`.
- Server code that calls the session is not limited. `session.setConfig()` and `session.command()` work for every key and command.
- `defineHarness` checks the names in `agents`. Plugins add their config keys and commands when a session opens, so it does not check those names.

Do not expose the `mode` of `permissions()` to clients that you do not trust. With `bypass`, every tool call runs with no question. See [Keep the mode on the server](./permissions#keep-the-mode-on-the-server).

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

To upload files and show the media that your agents make, read [Send and show media](./media).

## Use it from useChat

Your app already uses `useChat`. You want the same chat screen on a harness, with approvals, tools that run in the browser, and the thread after a reload. Point `useChat` at the `run` path of the handler.

1. Put the tools in a file that the server and the browser both import:

```ts group=harness-connect-tools
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const deploy = toolDefinition({
  name: 'deploy',
  description: 'Deploy the app. A person must approve it.',
  needsApproval: true,
  inputSchema: z.object({ env: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
})
```

2. On the server, give the harness the tool with its implementation:

```ts group=harness-connect-tools-server
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { deploy } from './tools'

export const deployer = defineHarness({
  name: 'acme/deployer',
  adapter: openaiText('gpt-5.6'),
  tools: [
    deploy.server(async () => {
      // Your deploy code runs here.
      return { ok: true }
    }),
  ],
})
```

Serve `deployer` with `createHarnessHandler`, as in [Serve the session over HTTP](#serve-the-session-over-http).

3. In the browser, give `useChat` the same tool definitions:

```tsx group=harness-connect-tools-client
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { deploy } from './tools'

export function Chat() {
  const { messages, interrupts, sendMessage } = useChat({
    threadId: 'user-1-thread',
    connection: fetchServerSentEvents('/api/harness/run'),
    tools: [deploy.client()] as const,
    // The input's context: tools and plugins read it.
    forwardedProps: { page: '/releases' },
  })

  return (
    <>
      <p>{messages.length} messages</p>
      {interrupts.map((interrupt) =>
        interrupt.kind === 'tool-approval' ? (
          <button
            key={interrupt.id}
            onClick={() => interrupt.resolveInterrupt(true)}
          >
            Approve {interrupt.toolName}
          </button>
        ) : null,
      )}
      <button onClick={() => sendMessage('Deploy to staging.')}>Deploy</button>
    </>
  )
}
```

The approval reaches the harness, and the tool runs on the server. What else `POST run` does for `useChat`:

- Each turn runs as the `runId` of its request. A retry with the same `runId` runs once. The same `runId` with another message gets `409`.
- A tool with only a `.client()` implementation runs in the browser, and the same turn gets its result.
- A question from `ctx.session.ask` arrives on the stream of the turn that waits for it.
- The `forwardedProps` of the request are the input's [context](./inputs#send-context-with-a-message).
- With `persistence: true`, `useChat` loads the thread from `GET run?threadId=`.
- If a turn still runs after a reload, `useChat` joins it with `GET run?runId=`. The turn shows from its first event, and its answer continues to stream.
- With more than one server, send `GET run?runId=` to the server that runs the turn. Only that server has the live events of the turn.

To keep the thread after a reload, set `persistence: true` in `useChat`:

```tsx group=harness-connect-tools-client
export function ReloadableChat() {
  const { messages } = useChat({
    threadId: 'user-1-thread',
    connection: fetchServerSentEvents('/api/harness/run'),
    tools: [deploy.client()] as const,
    persistence: true,
  })
  return <p>{messages.length} messages</p>
}
```

The join has these rules:

- `canAccess` decides who can join, the same as for every other path.
- The turn must run on the host that answers the request. On another host, the join gets `404`.
- A turn that ended gives the events that the session still keeps, and then the stream ends.

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

Tool approvals become permission requests in the editor. Image blocks, audio blocks, and embedded files in a prompt go to the media store of the session. ACP v2 is still a draft, so this API is experimental.

The editor does not show harness questions, for example the questions of `permissions()`. A tool call that asks a question waits, and the editor cannot answer it. See [Known limits](./permissions#known-limits).

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

Each outer thread gets its own inner session, so the harness keeps its own history. The inner session gets every content part of the last user message, so images and files go through too.

If a plugin picks the model of the harness, the harness has no adapter to read its input kinds from. Pass them with `harnessText(assistant, { host, inputModalities: ['text', 'image'] })`.

## What you have now

- One handler that serves standard AG-UI and the session stream.
- Clients that can change only what you expose.
- A `useChat` screen on the harness, with approvals, tools that run in the browser, and a reload that joins the running turn.
- A typed web client that reconnects and resumes from a cursor.
- A WebSocket, an ACP agent for editors, and a harness you can call from `chat()`.

Next: run the same harness in a terminal with the [CLI](./cli).
