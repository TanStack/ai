---
title: The harness wire protocol
id: harness-protocol
order: 3
description: "Every route, frame, and harness.* event of the harness session stream. Use it to write your own client or transport in any language."
keywords:
  - tanstack ai
  - harness
  - protocol
  - AG-UI
  - websocket
  - server-sent events
---

You want a client for a harness that is not `useChat` or `createHarnessClient`: a Python service, a mobile app, or a proxy of your own. This page lists every route, frame, and `harness.*` event, so you can write that client in any language.

Send a prompt to a thread with `curl`:

```bash
curl -X POST https://example.com/api/harness/control \
  -H 'authorization: Bearer my-token' \
  -H 'content-type: application/json' \
  -d '{"threadId":"thread-1","input":{"op":"prompt","message":"Hello"}}'
```

The command prints the receipt, for example `{"inputId":"in-1","status":"accepted","operationId":"op-1"}`. The first prompt also makes the thread. Then open the session stream of the thread:

```bash
curl -N -H 'authorization: Bearer my-token' \
  'https://example.com/api/harness/events?threadId=thread-1&v=2'
```

With no cursor, the stream starts at the first event of the thread. It shows the hello frame, then one SSE event per session event, and a ping comment when the stream is idle:

```text
data: {"type":"harness.hello","v":2,"threadId":"thread-1"}

id: 4
data: {"type":"harness.event","cursor":"4","threadId":"thread-1","operationId":"op-1","event":{"type":"TEXT_MESSAGE_CONTENT","messageId":"m-1","delta":"Hi"}}

: ping
```

The rest of this page is the reference for each part.

## Transports

The server is the handler of [Connect clients to a harness](./connect). One handler and one socket serve every transport on this page:

```ts group=harness-protocol-server
import { createHarnessHost, defineHarness, membersOnly } from '@tanstack/ai-harness'
import { createHarnessHandler, handleHarnessSocket } from '@tanstack/ai-harness/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'
import type { WebSocketLike } from '@tanstack/ai'

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

// Mount it on `/api/harness/*`.
export const handler = createHarnessHandler({ host, harness: assistant })

// Call it from the upgrade handler of your server.
export function onUpgrade(socket: WebSocketLike, request: Request) {
  handleHarnessSocket({ host, harness: assistant, socket, request })
}
```

Pick the transport that your client can use:

| Transport | Events | Inputs | Use it when |
| --- | --- | --- | --- |
| HTTP | `GET events` (SSE) | `POST control` (JSON) | Your client can read SSE. This works through most proxies. |
| WebSocket | `harness.event` frames | `harness.input` frames | You want one connection for events and inputs. |
| Stdio worker | NDJSON on stdout | NDJSON on stdin | You start the harness as a child process. |

The socket and the stdio worker use the same frames. The HTTP routes send the same `harness.*` frames as SSE `data`.

### HTTP routes

These routes are enough for a full client. [Connect clients to a harness](./connect#serve-the-session-over-http) lists the others (media, sessions, and more).

- `GET events?threadId=&v=&from=`: the session stream as SSE. Each SSE `data` is one frame. On a host with `access`, a thread that has no session yet answers `404`, so send the first input before you open it.
- `POST control`: the body is `{ threadId, input }`. The answer is the receipt as JSON.
- `GET snapshot?threadId=` and `GET transcript?threadId=`: the state and the saved messages of the thread. When the client starts, load both.
- `GET capabilities`: the AG-UI capabilities. `custom.tanstack.protocol` is the protocol version of the server.
- `GET host-events?v=`: the status changes and session list changes that the user may read, as SSE. Its `harness.hello` frame has no `threadId`.
- `POST run` and `GET run`: standard AG-UI for `useChat`. These routes send plain AG-UI events, with no `harness.*` frames around them.

`POST control` answers with these statuses:

- `200`: the receipt, `{ inputId, status, operationId?, reason? }`.
- `400`: `{ error }`. The input has a bad shape, or `threadId` is missing.
- `401`: `getUser` returned `null`.
- `403`: `{ error: 'forbidden' }`. The host refused the action.

A `rejected` receipt is still `200`. Its `reason` says why, for example `not_exposed`.

### The WebSocket

The first frame from the client must be `harness.subscribe`. The host reads the user from the upgrade request, with `getUser`. A browser cannot set headers on a WebSocket, so `getUser` must read a cookie or a token in the URL.

```ts group=harness-protocol-socket-client
import type { ControlFrame, HostFrame } from '@tanstack/ai-harness/server'

function isFrame(value: unknown): value is HostFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

const socket = new WebSocket('wss://example.com/api/harness/socket')
const send = (frame: ControlFrame) => socket.send(JSON.stringify(frame))

socket.addEventListener('open', () => {
  send({ type: 'harness.subscribe', threadId: 'thread-1', v: 2 })
})

socket.addEventListener('message', (message) => {
  const frame: unknown = JSON.parse(String(message.data))
  if (!isFrame(frame)) return
  if (frame.type === 'harness.hello') {
    send({
      type: 'harness.input',
      requestId: 'req-1',
      input: { op: 'prompt', message: 'Hello' },
    })
  }
  if (frame.type === 'harness.receipt') console.log(frame.requestId, frame.status)
  if (frame.type === 'harness.event') console.log(frame.cursor, frame.event.type)
  if (frame.type === 'harness.error') console.warn(frame.code, frame.message)
})
```

The socket closes with these codes:

| Code | Why | What the client does |
| --- | --- | --- |
| `4401` | `getUser` refused the user. | Sign in again. |
| `4403` | The user cannot read the thread, or lost access. | Stop. |
| `4400` | The server does not speak the `v` of the subscribe. | Stop. Use a client of the version of the server. |
| `4408` | The client read too slowly. See [Stream values](#stream-values). | Subscribe again from the last cursor. |
| `1011` | The event feed of the thread ended. | Subscribe again from the last cursor. |

### The stdio worker

`runHarnessWorker` reads frames from stdin and writes frames to stdout, one JSON object per line. Put it in its own script:

```ts group=harness-protocol-worker
import { defineHarness } from '@tanstack/ai-harness'
import { runHarnessWorker } from '@tanstack/ai-harness/worker'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

await runHarnessWorker(assistant)
```

Start the script as a child process, then write frames to it:

```ts group=harness-protocol-worker-client
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { ControlFrame } from '@tanstack/ai-harness/server'

const worker = spawn('node', ['worker.js'], { stdio: ['pipe', 'pipe', 'inherit'] })
const send = (frame: ControlFrame) => worker.stdin.write(`${JSON.stringify(frame)}\n`)

send({ type: 'harness.subscribe', threadId: 'thread-1', v: 2 })
send({ type: 'harness.input', requestId: 'req-1', input: { op: 'prompt', message: 'Hello' } })

for await (const line of createInterface({ input: worker.stdout })) {
  console.log(line)
}
```

- The worker runs the frames in order, so an input right after the subscribe is safe.
- The worker has no login. Every input runs with no user.
- The worker sends no heartbeat.
- When stdin closes, the worker exits. It also exits after an `unsupported_version` error.

To ship a harness as a worker with a checked bundle, see [Deploy a harness](./deploy).

## Frames

Each frame is one JSON object with a `type`. Ignore a frame with a `type` that you do not know. A later version of the server can add frames.

From the client to the host (socket and stdio worker):

| `type` | Fields | What it does |
| --- | --- | --- |
| `harness.subscribe` | `threadId`, `from?`, `v?` | The first frame. Starts the event stream after the cursor `from`. |
| `harness.input` | `requestId`, `input`, `traceparent?` | Sends one input. `input` is the same object as the `input` of `POST control`. |
| `harness.snapshot` | none | Asks for the snapshot of the session. |

`input` is one of the ops of [Send inputs to a session](./inputs), for example `{ op: 'prompt', message }` or `{ op: 'cancel', operationId }`. Pick a new `requestId` for each input. The receipt and any error frame repeat it.

From the host to the client:

| `type` | Fields | When |
| --- | --- | --- |
| `harness.hello` | `v`, `threadId` | First, after a subscribe that the host accepts. On SSE, the first event of `GET events`. |
| `harness.receipt` | `requestId`, `status`, `inputId?`, `operationId?`, `reason?` | The answer to one `harness.input`. |
| `harness.event` | `cursor`, `threadId`, `operationId`, `event` | One event of the session. |
| `harness.snapshot` | `snapshot` | The answer to a `harness.snapshot` frame. |
| `harness.error` | `message`, `code`, `requestId` | Something failed. See [Errors](#errors). |
| `harness.ping` | none | A heartbeat on the socket. Ignore it. |

### The event frame

- `event` is an AG-UI event in its wire form. It has only the keys of the AG-UI spec.
- `operationId` is the run that made the event. It is also the AG-UI `runId`.
- `threadId` is the thread that keeps the event. On the stream of a thread, it is that thread.
- The AG-UI `RUN_STARTED` event of a child run has `parentRunId`: the run that started it. A child run is an agent run that agent code started, or that a tool of a turn started. A top-level run has no `parentRunId`.
- An event of a subagent also has `subagentRunId` on the `event` itself.

The stream of a thread has the events of every run of its tree, in one order. To rebuild the tree, keep the `parentRunId` of the `RUN_STARTED` of each `operationId`. For example, a lead agent that runs two helpers in a group gives these frames (the `event` is cut):

```text
{"type":"harness.event","cursor":"9","threadId":"thread-1","operationId":"op-lead","event":{"type":"RUN_STARTED","runId":"op-lead",...}}
{"type":"harness.event","cursor":"12","threadId":"thread-1","operationId":"op-a","event":{"type":"RUN_STARTED","runId":"op-a","parentRunId":"op-lead",...}}
{"type":"harness.event","cursor":"13","threadId":"thread-1","operationId":"op-b","event":{"type":"RUN_STARTED","runId":"op-b","parentRunId":"op-lead",...}}
```

`op-a` and `op-b` are children of `op-lead`.

The status of a receipt is `accepted`, `queued`, or `rejected`. A `rejected` receipt has a `reason`, for example `not_exposed`, `not_running`, or `unknown_agent`.

Give each input an `inputId`, and send the same id again after a lost answer. A `prompt`, `command`, `agent`, or `append` input with the same `inputId` runs once. The `inputId` of its receipt is the id that you sent.

The socket handles the frames of one connection in the order they came.

## Cursors and reconnects

Each `harness.event` has a `cursor`. On SSE, the `id` of each event is the same cursor. A cursor is an opaque string. Store the last one, and do not parse it.

To continue after a disconnect, connect again with the last cursor:

- On SSE, send it as the `Last-Event-ID` header, or as `?from=`. When you send both, the header wins.
- On the socket and the stdio worker, send it as `from` in `harness.subscribe`.

```bash
curl -N -H 'authorization: Bearer my-token' -H 'Last-Event-ID: 4' \
  'https://example.com/api/harness/events?threadId=thread-1&v=2'
```

The stream starts with the first event after that cursor. A disconnect does not stop a running turn. To stop a turn, send a `cancel` input.

A cursor works on every server and after a restart only on a durable host (`stores.log`). See [Cursors](./connect#cursors).

### When events are missing

Sometimes the server no longer has the events after your cursor. A truncate of the log removes old records, for example. Then the stream sends one `CUSTOM` event with the name `harness.gap`, and continues from the first event that it has:

```json
{
  "type": "harness.event",
  "cursor": "120",
  "threadId": "thread-1",
  "operationId": "session",
  "event": {
    "type": "CUSTOM",
    "name": "harness.gap",
    "value": { "from": "12", "resumeAt": "120", "reason": "truncated" }
  }
}
```

- `from` is the cursor that you sent.
- `resumeAt` is the cursor of this event. The stream continues after it.
- `reason` is `truncated` (a truncate of the log) or `evicted` (the server memory dropped old events).

When you get `harness.gap`, do these steps:

1. Delete the state that you built from events.
2. Load `GET snapshot` and `GET transcript` again. On the socket, send `harness.snapshot`.
3. Store `resumeAt` as your cursor, and continue to read the stream.

A [session view](./custom-ui) does these steps for you.

## Protocol version

The protocol version is `2`.

- On SSE, send `?v=2` on `GET events`.
- On the socket and the stdio worker, send `v: 2` in `harness.subscribe`.
- With no `v`, the server uses its current version.

The `harness.hello` frame gives the version that the server uses. If the server does not speak your `v`, it sends one error frame and closes the stream:

```json
{
  "type": "harness.error",
  "message": "Protocol version 3 is not supported. This host speaks version 2.",
  "code": "unsupported_version",
  "requestId": "req-1"
}
```

The server speaks one version. Use a client of that version.

## Errors

A `harness.error` frame has a `code` and a `requestId`. `message` is for people, so read `code` in your code.

| `code` | Why | Does the stream close? |
| --- | --- | --- |
| `unauthorized` | `getUser` refused the user. | Yes. |
| `forbidden` | The user cannot read the thread, or lost access. On the socket, also when the host refuses one input. | Yes. When the host refuses one input, no. |
| `invalid_frame` | The frame is not valid JSON, has an unknown `type` or a bad `input`, comes before `harness.subscribe`, or is a second `harness.subscribe`. | No. |
| `unsupported_version` | The server does not speak the `v` that you sent. | Yes. |
| `slow_consumer` | The client read too slowly. | Yes. |
| `internal` | The server failed to read the events, or failed to apply one input. | When the read failed, yes: connect again from the last cursor. When one input failed, no. |

On HTTP, a refused login or action before the stream starts is the `401` or `403` status of the request, with no frame.

`createHarnessClient` reads these frames for you. After `slow_consumer`, `events()` and `hostEvents()` connect again. Any other code ends the read with a `HarnessProtocolError`, which has the `code` and the `message`.

The `requestId` connects the error to its request:

- On the socket and the stdio worker, it is the `requestId` of the frame that failed. A frame with no `requestId` gets an id from the server. On the socket, that id is the id of the upgrade request.
- On HTTP, the id is your `X-Request-Id` header when it is a short safe id: 1 to 128 letters, digits, `-`, `_`, `.`, or `:`. Else the server makes a new UUID.
- Every HTTP answer of the handler sends the id back in the `X-Request-Id` header.

Log the `requestId` with your errors. Then you can find the request in the server logs.

## Stream values

A long stream passes through proxies and slow networks. The server keeps it open and protects itself with these values:

| Value | Option | Default | What happens |
| --- | --- | --- | --- |
| Heartbeat | `heartbeatMs` | 20 s | SSE gets a `: ping` comment. The socket gets `{"type":"harness.ping"}`. |
| SSE queue | `sseQueueBytes` | 1 MiB | The server stops reading the log while this much data waits for the client. |
| Socket buffer | `socketBufferBytes` | 8 MiB | Above this `bufferedAmount`, the server stops sending. It checks again every 50 ms. |
| Slow close | `slowConsumerMs` | 30 s | If the client does not read for this long, the server sends `slow_consumer` and closes. |

- `POST run` and `GET run` also get the `: ping` comment. SSE parsers skip comments.
- A slow client loses no events. The server reads them from the log when the client reads again.
- Set the idle timeout of your proxy to more than the heartbeat.
- A client can use the heartbeat to find a dead connection. `createHarnessClient` connects again when no bytes come for 60 s (its `idleTimeoutMs`). If you set `heartbeatMs` to 60 s or more, set a larger `idleTimeoutMs` on the client.
- The stdio worker has no heartbeat and does not use these values.

To change a value, pass `stream` to the handler and to the socket. A value that you do not set keeps its default:

```ts group=harness-protocol-server
// A proxy that closes idle streams after 15 s, and mobile clients that read slowly.
const stream = { heartbeatMs: 10_000, slowConsumerMs: 60_000 }

export const slowNetworkHandler = createHarnessHandler({ host, harness: assistant, stream })

export function onSlowNetworkUpgrade(socket: WebSocketLike, request: Request) {
  handleHarnessSocket({ host, harness: assistant, socket, request, stream })
}
```

Each value must be a finite number above 0. If a value is not, `createHarnessHandler` and `handleHarnessSocket` throw at the start, and the error names the field.

## Traces

To join a turn to the trace of your app, send a W3C `traceparent`:

- On HTTP, send the `traceparent` header on `POST control` or `POST run`.
- On the socket and the stdio worker, set `traceparent` on the `harness.input` frame.

```ts
const response = await fetch('/api/harness/control', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  },
  body: JSON.stringify({
    threadId: 'thread-1',
    input: { op: 'prompt', message: 'Hello' },
  }),
})
console.log(response.headers.get('X-Request-Id'))
```

What the harness does with it:

- It reads the `traceparent` of a message input only: `prompt`, `steer`, `followUp`, and the turn of `POST run`. Other inputs ignore it.
- It drops a value that is not a valid W3C `traceparent`.
- It stores the value on the `harness.input` record of the log. When another server owns the thread, the value goes to that server with the input.
- When the input starts a turn, the server that runs the turn gives its `harness.operation` span a link to the value. A link is not a parent, so your trace UI shows the turn as a linked trace.

To give the host a tracer, see [Trace runs and report operations](./deploy#trace-runs-and-report-operations).

## Event catalog

A harness adds its own events to the stream as AG-UI `CUSTOM` events. `name` is the event name, and `value` has the fields below. Ignore a name that you do not know. A later version can add names.

In TypeScript, `HarnessEventValues` from `@tanstack/ai-harness` maps each name to its value type, and `HARNESS_EVENTS` has the names. `harness.plugin.warning` is the only name that is in neither.

### Runs

| `name` | `value` |
| --- | --- |
| `harness.operation.started` | `{ operationId, kind, agent? }`. `kind` is `chat`, `agent`, `command`, or `compact`. |
| `harness.operation.finished` | `{ operationId, status }`. `status` is `completed`, `failed`, `cancelled`, or `interrupted`. |
| `harness.operation.resumed` | `{ operationId, resumedFrom? }`. A host continued a run after another host stopped. |
| `harness.turn.retry` | `{ operationId, retries, error: { message, code?, retryAfterMs? }, continued }`. `continued` is true when the model continues a partial answer. |
| `harness.handoff` | `{ from, to, note?, runId, by, waitId? }`. `from` and `to` are an agent name, `null` for the main model, or `{ human: true }`. `by` is `tool`, `code`, `router`, or `operator`. A handoff to a person has the `waitId` of its wait. |
| `harness.usage` | `{ model, sender?, source?, label?, usage, total }`. `usage` is this model call, and `total` is the new total of the thread. `source` is `plugin:<name>`, `router`, or `transfer`. A turn or an agent run has no `source`. |

### Inputs

| `name` | `value` |
| --- | --- |
| `harness.input.accepted` | `{ inputId, op }` |
| `harness.input.queued` | `{ inputId, delivery }`. The owner of the log stored the input, and it waits behind the running turn or the turns before it. `delivery` is `steer` or `queue`. |
| `harness.input.applied` | `{ inputId, operationId }` |
| `harness.input.rejected` | `{ inputId, reason }` |
| `harness.input.settled` | `{ inputId, operationId?, outcome, error? }`. `outcome` is `completed`, `aborted`, `interrupted`, or `failed`. Only `failed` has `error: { message, code? }`. |
| `harness.input.delivery` | `{ inputId, delivery }`. A `setDelivery` input moved a waiting input. |

### Waits for a person

| `name` | `value` |
| --- | --- |
| `harness.wait.opened` | `{ waitId, kind, runId, message?, expiresAt? }`. A wait opened in the log: a question, a `step.ask`, a handoff to a person, or a wait of a background agent run. `kind` is `approval`, `question`, `sign-in`, `client-tool`, or `human`. `expiresAt` is in epoch milliseconds. The interrupts of a turn come in its `RUN_FINISHED`. |
| `harness.wait.settled` | `{ waitId, outcome }`. `outcome` is `answered`, `cancelled`, or `expired`. |
| `harness.question` | `{ questionId, message, schema?, secret?, url? }`. Answer it with the `answer` input. |
| `harness.question.answered` | `{ questionId }` |
| `harness.auth_required` | `{ connector, url?, userCode? }`. A tool needs a sign-in. |

### Session changes

When you get one of these events, load the part of the session that it names again.

| `name` | `value` |
| --- | --- |
| `harness.config.changed` | `{ key, value }` |
| `harness.settings.changed` | `{ settings }` |
| `harness.commands.changed` | `{}`. Load `GET describe` again. |
| `harness.reloaded` | `{ error? }`. The plugins started again. Load `GET describe` again. |
| `harness.reset` | `{ inputId, note? }`. The next turn starts a fresh model context. |
| `harness.revert` | `{ messageId }`. `messageId` is `null` when no revert stands. Load `GET transcript` again. |

### Files, plugins, and hosts

| `name` | `value` |
| --- | --- |
| `harness.media` | A media record: `{ id, threadId, kind, mimeType, name, size, createdAt, source }`. See [Send and show media](./media). |
| `harness.plugin.event` | `{ plugin, name, value }`. An event that a plugin sent. |
| `harness.plugin.warning` | `{ plugin, message }`. A plugin hook, a listener, or a write that no one waits for failed. The work goes on. |
| `harness.ownership.changed` | `{ epoch, reason }`. A new host owns the log, from its first write. `reason` is `taken_over` when the ownership of the old owner expired with no release (it stopped), else `acquired`. |
| `harness.stranded` | `{ operationId?, hostId? }`. The workspace that the log binds the thread to is gone, so the workspace tools fail. `operationId` is the run that tried it. `hostId` is the host of a folder. |
| `harness.transferred` | `{ transferId, from?, to? }`. `from` and `to` are `{ threadId }`. The conversation came from, or went to, another thread. |
| `harness.gap` | `{ from, resumeAt, reason }`. See [When events are missing](#when-events-are-missing). |

## What you have now

- A client that reads the session stream over SSE, a WebSocket, or a stdio worker.
- Inputs with a receipt for each one, and errors that name their request.
- Reconnects that continue from the last cursor, and a reload when events are missing.
- A stream that stays open through proxies.
- The name and the value of every `harness.*` event.

Next: send your first prompt with the two `curl` commands at the top of this page, and watch the events arrive.
