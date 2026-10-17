---
title: Connect clients to a harness
id: harness-connect
order: 2
description: "Serve a harness session over HTTP, SSE, or WebSocket. Talk to it from a web app or another chat() call."
keywords:
  - tanstack ai
  - harness
  - AG-UI
  - websocket
  - harnessText
---

Your harness runs on a server, but the people who use it are in a browser or another agent. `createHarnessHandler` serves a session over HTTP. A web app talks to it with `createHarnessClient`, and another `chat()` call with `harnessText`.

## Serve the session over HTTP

Mount one fetch handler on a route. The host reads the user of each request with its `access`, so no endpoint is open by accident.

```ts group=harness-connect
import { createHarnessHost, defineHarness, membersOnly } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    identify: ({ request }) =>
      request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
        ? { id: 'user-1' }
        : null,
    authorize: membersOnly(),
  },
})

export const handler = createHarnessHandler({ host, harness: assistant })
```

- `identify` reads the user of each request. `null` answers `401`.
- `authorize` decides each action. A refused action answers `403`. `membersOnly()` lets a user use the threads they opened and the threads shared with them.
- A host with no `access` needs `openAccess` on the handler, else `createHarnessHandler` throws at the start. See [Serve with no login](./access#serve-with-no-login).

[Access and tenants](./access) has the full rules.

On a durable host (`stores.log`), also set `media: { secret }`. The secret signs media URLs, so every instance must use the same value. Without a log store, the default is a random key, and signed URLs stop working after a restart.

The handler answers these paths under your route. For chat and events:

- `GET capabilities`: the AG-UI capabilities, with the agents in `expose.agents`.
- `POST run`: standard AG-UI. One request runs one prompt and streams it as SSE. The prompt keeps every content part of the last user message, for example an image. `useChat` works with it. See [Use it from useChat](#use-it-from-usechat).
- `GET run?threadId=`: the saved messages, the running turn, and the waiting approvals, for a `useChat` that loads the thread after a reload.
- `GET run?runId=`: the turn with that run id as SSE, from its first event. A reloaded `useChat` joins a running turn with it.
- `GET events?threadId=`: every event of the session as SSE. Each event id is a cursor, so a reconnect with `Last-Event-ID` continues where it stopped.

For one session:

- `POST control`: send `{ threadId, input }`, for example `{ op: 'prompt', message }`. You get a receipt back. Agents, settings, config keys, and commands need `expose`. See [Choose what clients can change](#choose-what-clients-can-change).
- `GET snapshot?threadId=`: the status, running operations, and waiting approvals.
- `GET transcript?threadId=` and `GET describe?threadId=`: the saved messages, and the commands and settings that a client can use.
- `GET agent-transcript?threadId=&subagentRunId=`: the saved messages of one child agent of the thread. See [Show what a child wrote after a reload](./subagents#show-what-a-child-wrote-after-a-reload).
- `POST media`, `GET media-url`, and `GET media`: upload a file, get a signed URL, and read the bytes. A signed URL works for 1 hour, and only for the user it was signed for. See [Send and show media](./media).

For a list of sessions:

- `GET sessions`: one page of the sessions that this user can list, newest first.
- `POST sessions`: change a session with `{ op, threadId }`. The ops are `rename`, `update`, `delete`, `fork`, `share`, and `unshare`. See [List, rename, and fork sessions](./sessions) and [Share the thread](./shared-threads#2-share-the-thread).
- `GET host-events`: the status changes and index changes of the sessions that this user can read, as SSE.

A read of a thread that does not exist answers `404`. Only `GET run?threadId=` answers an empty thread, because `useChat` reads it before the first message.

The read paths read the thread without a session, so they set up no plugins and claim nothing. `GET describe` opens the session, because the plugins give the commands and the settings. For a read route of your own, use `host.observe`. See [Read a thread without a session](./lifecycle#read-a-thread-without-a-session).

## Cursors

Each event id of `GET events` and `GET run`, and the `cursor` of each `harness.event` frame, is an opaque string. Send it back as `Last-Event-ID` or `from`, as it is. Do not parse it.

- On a durable host (`stores.log`), a cursor is a position in the log of the thread. It works on every instance and after a restart.
- Without a log store, a cursor is a counter in the memory of one process. Another instance or a restart does not know it.

To run more than one instance behind one URL, use `stores.log`.

## Choose what clients can change

A client can send a prompt and answer questions. Other inputs can change how the session works, so a client can use only what the harness exposes. Nothing is exposed by default.

Name what a client can use in `expose`:

```ts group=harness-connect
export const team = defineHarness({
  name: 'acme/team-assistant',
  adapter: openaiText('gpt-6.1-sol'),
  expose: { settings: ['instructions'], commands: ['undo'] },
})
```

| Field | What a client can do |
| --- | --- |
| `agents` | Run these agents, for example with `client.agents.<name>.start(input)`. |
| `settings` | Change these [thread settings](./thread-settings) with `client.configure({ settings })`. |
| `config` | Set these plugin config keys with `client.setConfig({ key, value })`. |
| `commands` | Run these commands with `client.command({ name })`, or with `/name` in a [session view](./custom-ui) on a client. |
| `tools` | Run these harness tools with no model turn, with `client.tool({ name, args })`. See [Run a tool without a model](./tool-runs). |
| `records` | Add records of these types to the thread with `client.append(records)`. See [Let a client add records](./session-log#let-a-client-add-records). |

- Any other input of these kinds gets `{ status: 'rejected', reason: 'not_exposed' }`.
- `GET describe` and `client.describe()` list only the exposed commands and config keys. A UI built from them shows only what a client can use.
- Server code that calls the session is not limited. `session.setConfig()` and `session.command()` work for every key and command, and `session.describe()` lists all of them.
- `defineHarness` checks the names in `agents` and `tools`, and TypeScript suggests them. Plugins add their config keys and commands when a session opens, so it does not check those names.

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

await client.send('Summarize my open tickets.')

for await (const entry of client.events()) {
  if (entry.event.type === 'TEXT_MESSAGE_CONTENT') {
    console.log(entry.event.delta)
  }
}
```

`events()` reconnects after a network error and continues from the last cursor. A second tab, a phone, or a reload all see the same session.

To upload files and show the media that your agents make, read [Send and show media](./media).

## Send a message to a running agent

A background agent runs for minutes, and the user wants to correct it from the page, or ask for one more change after it ends. The browser sends the run a message with `client.send(message, { to: operationId })`.

1. On the server, list the agent in `expose.agents`. A client can start and message only those agents:

```ts group=harness-connect-agents
import { defineAgent } from '@tanstack/ai'
import { createHarnessHost, defineHarness, membersOnly } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const drafter = defineAgent({
  name: 'drafter',
  description: 'Drafts a blog post',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol'), stream: false }),
})

export const studio = defineHarness({
  name: 'acme/studio',
  adapter: openaiText('gpt-6.1-sol'),
  agents: [drafter],
  expose: { agents: ['drafter'] },
})

const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    identify: ({ request }) =>
      request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
        ? { id: 'user-1' }
        : null,
    authorize: membersOnly(),
  },
})

export const handler = createHarnessHandler({ host, harness: studio })
```

2. In the browser, send the message to the id of the run:

```ts group=harness-connect-agents-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { studio } from './harness'

const client = createHarnessClient<typeof studio>({
  url: '/api/harness',
  threadId: 'user-1-thread',
  headers: { authorization: 'Bearer my-token' },
})

export async function correct(operationId: string) {
  const receipt = await client.send('Cite papers, not blogs.', {
    to: operationId,
  })
  if (receipt.status === 'rejected') {
    console.warn(receipt.reason)
  }
}

export function addTitle(operationId: string) {
  return client.send('Add a title.', { to: operationId, mode: 'followUp' })
}
```

The id of the run is the `operationId` in the receipt of `client.agents.drafter.start()`. A [session view](./custom-ui#3-act-on-the-session) also lists the running agents with their ids.

- `mode: 'steer'` (the default): the message joins the next model call of the run.
- `mode: 'followUp'`: the agent runs again after the run ends. `receipt.operationId` is the id of the new run.

`send` with `to` posts an `agentMessage` input to `POST control`. It runs as the user that `identify` returned. The input looks like this:

```json
{ "op": "agentMessage", "operationId": "op-agent-m1x2-3", "message": "Add a title.", "mode": "followUp" }
```

The session rejects the message with a `reason` in these cases:

- `not_running`: the session does not know the run. Another host can run it, or the id is wrong.
- `not_exposed`: the agent of the run is not in `expose.agents`.

For how steers and follow-ups run on the server, see [Message a running agent](./subagents#message-a-running-agent).

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
  adapter: openaiText('gpt-6.1-sol'),
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
- On a durable host (`stores.log` and `stores.runs`), each event of `POST run` has its log cursor as its id. If the connection drops, `useChat` sends the request again with `Last-Event-ID`. Any server continues the stream from there, and the turn does not run again.

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

- The host checks that the user can read the thread, the same as for every other path.
- On a durable host, any server can answer the join. It reads the turn from the shared log.
- Without a log store, the turn must run on the host that answers the request. On another host, the join gets `404`.
- A turn that ended gives the events that the session still keeps, and then the stream ends.

## Use a WebSocket

For one connection that carries events and inputs, hand the socket and its upgrade request to `handleHarnessSocket`:

```ts group=harness-connect
import { handleHarnessSocket } from '@tanstack/ai-harness/server'
import type { WebSocketLike } from '@tanstack/ai'

export function onUpgrade(socket: WebSocketLike, request: Request) {
  handleHarnessSocket({ host, harness: assistant, socket, request })
}
```

The client sends `{ type: 'harness.subscribe', threadId }` first. After that, each `harness.input` frame gets a `harness.receipt`, and every event arrives as a `harness.event` frame with its cursor.

- The host reads the user from the upgrade request with `identify`, the same as for HTTP. Every input on the socket runs as that user.
- A user that `identify` refuses gets an `unauthorized` error frame, and the socket closes.
- A user who cannot read the thread, or who loses access later, gets a `forbidden` error frame, and the socket closes.
- On a host with no `access`, pass `openAccess`, the same as for `createHarnessHandler`.

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

- One handler that serves standard AG-UI and the session stream, as the user of each request.
- Clients that can change only what you expose.
- A `useChat` screen on the harness, with approvals, tools that run in the browser, and a reload that joins the running turn.
- A typed web client that reconnects and resumes from a cursor.
- Messages from the browser to a running agent.
- A WebSocket, and a harness you can call from `chat()`.

Next: run the same harness in a terminal with the [CLI](./cli).
