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
    getUser: ({ request }) =>
      request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
        ? { id: 'user-1' }
        : null,
    rules: membersOnly(),
  },
})

export const handler = createHarnessHandler({ host, harness: assistant })
```

- `getUser` reads the user of each request. `null` answers `401`.
- `isAllowed` decides each action. A refused action answers `403`. `membersOnly()` lets a user use the threads they opened and the threads shared with them.
- A host with no `access` needs `openAccess` on the handler, else `createHarnessHandler` throws at the start. See [Serve with no login](./access#serve-with-no-login).

[Access and tenants](./access) has the full rules.

When more than one instance serves the same URL, also set `media: { secret }`. The secret signs media URLs, so every instance must use the same value. Without it, the handler signs with a random key of its own, so a signed URL works only on this instance, until it restarts.

On a host with `ownership` options, `createHarnessHandler` throws at the start when `media` is not set. On another host without `media`, the first handler logs one warning.

```ts group=harness-connect
const mediaKey = process.env.MEDIA_KEY
const oldMediaKey = process.env.OLD_MEDIA_KEY
if (!mediaKey || !oldMediaKey) {
  throw new Error('Set MEDIA_KEY and OLD_MEDIA_KEY.')
}

export const rotatingHandler = createHarnessHandler({
  host,
  harness: assistant,
  // The first key signs. Every key checks the URLs.
  media: { keys: [mediaKey, oldMediaKey] },
})
```

- Each key must be at least 32 bytes. A shorter key throws at the start.
- To change the key, put the new key first in `keys` and keep the old key after it. A URL that the old key signed works until it expires (1 hour). Then remove the old key.
- A signed URL works only for this harness, in the tenant of the user who got it. Each request still needs a user from `getUser` that can read the thread, so send the login with it. For a request with no login, see [Serve media to a request with no login](./access#serve-media-to-a-request-with-no-login). When the thread is deleted, its URLs answer `404`.

A request body over `media.maxBodyBytes` (default 32 MiB) answers `413`. See [Files inside a client message](./media#files-inside-a-client-message).

The handler answers these paths under your route. For chat and events:

- `GET capabilities`: the AG-UI capabilities, with the agents in `expose.agents`.
- `POST run`: standard AG-UI. One request runs one prompt and streams it as SSE. The prompt keeps every content part of the last user message, for example an image. `useChat` works with it. See [Use it from useChat](#use-it-from-usechat).
- `GET run?threadId=`: the saved messages, the running turn, and the waiting approvals, for a `useChat` that loads the thread after a reload.
- `GET run?runId=&threadId=`: the turn with that run id as SSE, from its first event. A reloaded `useChat` joins a running turn with it. Another instance finds the turn only with `threadId`. See [Join a turn after a reload](#join-a-turn-after-a-reload).
- `GET events?threadId=`: every event of the session as SSE. Each event id is a cursor, so a reconnect with `Last-Event-ID` continues where it stopped.

For one session:

- `POST control`: send `{ threadId, input }`, for example `{ op: 'prompt', message }`. You get a receipt back. Agents, settings, config keys, and commands need `expose`. See [Choose what clients can change](#choose-what-clients-can-change).
- `GET snapshot?threadId=`: the status, running operations, and waiting approvals.
- `GET transcript?threadId=` and `GET describe?threadId=`: the saved messages, and the commands and settings that a client can use.
- `GET agent-transcript?threadId=&subagentRunId=`: the saved messages of one child agent of the thread. See [Show what a child wrote after a reload](./subagents#show-what-a-child-wrote-after-a-reload).
- `POST media`, `GET media-url`, and `GET media`: upload a file, get a signed URL, and read the bytes. A signed URL works for 1 hour, and only for a user who can read the thread. See [Send and show media](./media).

For a list of sessions:

- `GET sessions`: one page of the sessions that this user can list, newest first.
- `POST sessions`: change a session with `{ op, threadId }`. The ops are `rename`, `update`, `delete`, `fork`, `share`, and `unshare`. `client.sessions` has one method for each op. A thread that is not there throws `404`. See [List, rename, and fork sessions](./sessions) and [Share the thread](./shared-threads#2-share-the-thread).
- `GET host-events`: the status changes and index changes of the sessions that this user can read, as SSE.

A read of a thread that does not exist answers `404`. Only `GET run?threadId=` answers an empty thread, because `useChat` reads it before the first message.

The read paths read the thread without a session, so they set up no plugins and claim nothing. `GET describe` opens the session, because the plugins give the commands and the settings. For a read route of your own, use `host.observe`. See [Read a thread without a session](./lifecycle#read-a-thread-without-a-session).

## Cursors

Each event id of `GET events` and `GET run`, and the `cursor` of each `harness.event` frame, is an opaque string. Send it back as `Last-Event-ID` or `from`, as it is. Do not parse it.

A cursor is a position in the log of the thread. It works on every instance that reads the same log store, and after a restart when the store keeps the log. With the memory log of `memoryPersistence()`, only this process knows the log.

To run more than one instance behind one URL, give every instance the same log store.

Sometimes the events after a cursor are gone. A host with `keepLogRecords: 'since-snapshot'` drops old records (see [Drop the records before a snapshot](./lifecycle#drop-the-records-before-a-snapshot)), and before its log opens, a session keeps only its newest events in memory. A reader whose cursor is in the lost part gets one `CUSTOM` event first:

- Its name is `harness.gap` (`HARNESS_EVENTS.gap`).
- Its value is an `EventGap`: `{ from, resumeAt, reason }`. `reason` is `truncated` or `evicted`. Its cursor is `resumeAt`.
- Then the stream goes on from `resumeAt`.

The session view loads the snapshot and the transcript again when it sees this event. A custom client must do the same. See [When events are missing](./protocol#when-events-are-missing).

## Keep the stream open

Every transport sends the same frames: each event is an AG-UI wire chunk in a `harness.event` frame. A long stream stays usable through proxies and slow networks:

- The first frame of `GET events` and of the socket is `harness.hello`, with the protocol version `v`. A client can ask for a version with `?v=2` or `v: 2`.
- When the stream is idle, the server sends a heartbeat every 20 s. Set the idle timeout of your proxy to more than that.
- A client that does not read for 30 s gets a `slow_consumer` error frame, and the stream closes. Connect again from the last cursor.
- Every answer of the handler has an `X-Request-Id` header, and every error frame has a `code` and a `requestId`. Log the id, to find the request in the server logs.
- To know who has a stream open, pass `presence: { onConnect, onDisconnect }` to `createHarnessHost`. See [Show who is here](./shared-threads#8-show-who-is-here).

To change the heartbeat or the limits, pass `stream` to `createHarnessHandler` and `handleHarnessSocket`. [The harness wire protocol](./protocol) lists every frame, the error codes, and the `stream` values, for a client in any language.

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
| `settings` | Change these [thread settings](./thread-settings) with `client.updateThreadSettings({ settings })`. |
| `config` | Set these plugin config keys with `client.setPluginSetting({ key, value })`. |
| `commands` | Run these commands with `client.runCommand({ name })`, or with `/name` in a [session view](./custom-ui) on a client. |
| `tools` | Run these harness tools with no model turn, with `client.runTool({ name, args })`. See [Run a tool without a model](./tool-runs). |
| `records` | Add records of these types to the thread with `client.appendRecords({ records })`. See [Let a client add records](./session-log#let-a-client-add-records). |

- Any other input of these kinds gets `{ status: 'rejected', reason: 'not_exposed' }`.
- `GET describe` and `client.describe()` list only the exposed commands and config keys. A UI built from them shows only what a client can use.
- Server code that calls the session is not limited. `session.setPluginSetting()` and `session.runCommand()` work for every key and command, and `session.describe()` lists all of them.
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

const { cursor } = await client.snapshot()
await client.send('Summarize my open tickets.')

for await (const entry of client.events({ from: cursor })) {
  if (entry.event.type === 'TEXT_MESSAGE_CONTENT') {
    console.log(entry.event.delta)
  }
}
```

`events()` reconnects after a network error and continues from the last cursor. It also reconnects when no bytes come for 60 s, so a dead connection (a laptop that slept) does not stay `open`. To change that time, pass `idleTimeoutMs` to `createHarnessClient`. Keep it larger than the [heartbeat](./protocol#stream-values) of the server, or the client reconnects again and again. A second tab, a phone, or a reload all see the same session.

Without `from`, `events()` starts at the newest event, so it sends no old events. That is why the example reads the snapshot cursor before it sends.

- To read every event from the start of the session, pass `from: '0'`. Do this when you rebuild a transcript from the events.
- If the snapshot answer has no `cursor` (the URL is not a harness handler), `events()` throws and does not try again.

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
    getUser: ({ request }) =>
      request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
        ? { id: 'user-1' }
        : null,
    rules: membersOnly(),
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

`send` with `to` posts an `agentMessage` input to `POST control`. It runs as the user that `getUser` returned. The input looks like this:

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
- A question of `step.ask` or of an MCP server arrives on the stream of the turn that waits for it. See [Wait for a person](./waits).
- The `forwardedProps` of the request are the input's [context](./inputs#send-context-with-a-message).
- With `persistence: true`, `useChat` loads the thread from `GET run?threadId=`.
- If a turn still runs after a reload, `useChat` joins it with `GET run?runId=`. The turn shows from its first event, and its answer continues to stream.
- Each event of `POST run` has its log cursor as its id. If the connection drops, `useChat` sends the request again with `Last-Event-ID`. Any server continues the stream from there, and the turn does not run again.

### Join a turn after a reload

To keep the thread after a reload, set `persistence: true` in `useChat`. Put the `threadId` in the URL of the connection too:

```tsx group=harness-connect-tools-client
export function ReloadableChat() {
  const { messages } = useChat({
    threadId: 'user-1-thread',
    connection: fetchServerSentEvents('/api/harness/run?threadId=user-1-thread'),
    tools: [deploy.client()] as const,
    persistence: true,
  })
  return <p>{messages.length} messages</p>
}
```

The join has these rules:

- The host checks that the user can read the thread, the same as for every other path.
- The join request of `useChat` sends only the run id. With `threadId` in the URL, any instance that reads the same log store can answer the join. It reads the turn from the log of that thread.
- Without `threadId`, only the instance that runs the turn finds it. Another instance answers `400`.
- A turn that ended gives the events that the session still keeps, and then the stream ends.

### Stop a turn from useChat

The `stop()` of `useChat` closes the request, but the turn continues on the server. A closed connection never cancels work, because another tab or a reload can still read the turn. To stop the turn too, send a `cancel` input for its run.

1. On the server, serve the harness with one handler. `POST run` streams the turn to `useChat`, and `POST control` takes the cancel:

```ts group=harness-connect-stop-server
import { createHarnessHost, defineHarness, membersOnly } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const writer = defineHarness({
  name: 'acme/writer',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    getUser: ({ request }) =>
      request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
        ? { id: 'user-1' }
        : null,
    rules: membersOnly(),
  },
})

// Mount it on `/api/harness/*`.
export const handler = createHarnessHandler({ host, harness: writer })
```

2. In the browser, call `client.cancel` with the `runId` of `useChat` in your stop handler. The turn of `POST run` runs as that id:

```tsx group=harness-connect-stop-client
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { writer } from './harness'

const headers = { authorization: 'Bearer my-token' }

const client = createHarnessClient<typeof writer>({
  url: '/api/harness',
  threadId: 'user-1-thread',
  headers,
})

export function StoppableChat() {
  const { messages, runId, isLoading, stop, sendMessage } = useChat({
    threadId: 'user-1-thread',
    connection: fetchServerSentEvents('/api/harness/run', { headers }),
  })

  const stopTurn = async () => {
    stop()
    if (!runId) return
    const receipt = await client.cancel({ operationId: runId })
    if (receipt.status === 'rejected') console.warn(receipt.reason)
  }

  return (
    <>
      <p>{messages.length} messages</p>
      <button onClick={() => sendMessage('Write a long story.')}>Send</button>
      {isLoading ? <button onClick={stopTurn}>Stop</button> : null}
    </>
  )
}
```

- The cancel works on any server that reads the same log store. The input goes to the server that runs the turn.
- If the turn already ended, the receipt can be `rejected` with the reason `not_running`.
- The turn ends with the status `cancelled`.

## Use a WebSocket

For one connection that carries events and inputs, hand the socket and its upgrade request to `handleHarnessSocket`:

```ts group=harness-connect
import { handleHarnessSocket } from '@tanstack/ai-harness/server'
import type { WebSocketLike } from '@tanstack/ai'

export function onUpgrade(socket: WebSocketLike, request: Request) {
  handleHarnessSocket({ host, harness: assistant, socket, request })
}
```

The client sends `{ type: 'harness.subscribe', threadId }` first, and the host answers with a `harness.hello` frame. After that, each `harness.input` frame gets a `harness.receipt`, and every event arrives as a `harness.event` frame with its cursor.

- The host reads the user from the upgrade request with `getUser`, the same as for HTTP. Every input on the socket runs as that user.
- A user that `getUser` refuses gets an `unauthorized` error frame, and the socket closes.
- The socket handles the frames of one connection in the order they came. So a prompt with a large image reaches the session before the frame after it.
- A user who cannot read the thread, or who loses access later, gets a `forbidden` error frame, and the socket closes.
- A frame over `media.maxBodyBytes` (default 32 MiB) gets an error frame, and the socket closes with code `1009`. Your WebSocket server reads the whole frame before this check, so the check does not cap memory. Set the frame limit of your server too, for example `maxPayload` of `ws`.
- On a host with no `access`, pass `openAccess`, the same as for `createHarnessHandler`.
- Pass `socket: true` to `createHarnessHandler` too. Then `GET capabilities` says `transport.websocket: true`, so clients know that they can use the socket. The default is `false`.

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

- Who runs the inner turn: when the outer `chat()` runs inside a harness turn, the inner session opens as the user of that turn. Else it opens as `user`, for example `harnessText(assistant, { host, user: { id: 'ada' } })`.
- Access: the inner thread is `<outer thread id>/inner/<harness name>`. When `host` has `access` and also runs the outer thread, the inner session is checked through the outer thread, so every user who can read a shared outer thread can use its inner session. From app code, `host.open`, `host.submit`, `host.fork`, and `host.transfer` refuse any thread id with `/inner/`.
- Usage: the outer run gets the token usage of every inner model call, so the usage totals of the outer session count them.
- Cancel: an abort of the outer call cancels the inner turn. For a remote harness, `harnessText({ url, token })` also tells the remote host to cancel the turn.

If a plugin picks the model of the harness, the harness has no adapter to read its input kinds from. Pass them with `harnessText(assistant, { host, inputModalities: ['text', 'image'] })`.

## What you have now

- One handler that serves standard AG-UI and the session stream, as the user of each request.
- Clients that can change only what you expose.
- A `useChat` screen on the harness, with approvals, tools that run in the browser, a reload that joins the running turn, and a stop button that cancels the turn.
- A typed web client that reconnects and resumes from a cursor.
- Messages from the browser to a running agent.
- A WebSocket, and a harness you can call from `chat()`.

Next: run the same harness in a terminal with the [CLI](./cli).
