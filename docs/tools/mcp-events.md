---
title: MCP Events
id: mcp-events
order: 13
description: "Subscribe to MCP Events webhooks, verify Standard Webhooks signatures, and handle deliveries in a Request to Response handler."
keywords:
  - tanstack ai
  - mcp
  - mcp events
  - webhook
  - sep-3415
  - standard webhooks
---

An MCP server can push work to you: a new incident, a finished job, a ticket change. You want that push to hit your app as a signed webhook, not as a poll loop.

`@tanstack/ai-mcp` implements the MCP Events extension (SEP-3415) for webhook delivery. You list event types, subscribe with a callback URL, and handle deliveries with `createMCPEventWebhook`.

> **Experimental.** The wire format follows [SEP-3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415) draft revision `2ec39b9`. Method names and error codes can still change.

A TanStack Start app that subscribes and receives a signed webhook is in [Subscribe to MCP Events](../tutorials/mcp-events).

## Install

Install the client package. The events API is a subpath of that package.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mcp @modelcontextprotocol/client
vue: @tanstack/ai-mcp @modelcontextprotocol/client
solid: @tanstack/ai-mcp @modelcontextprotocol/client
svelte: @tanstack/ai-mcp @modelcontextprotocol/client
preact: @tanstack/ai-mcp @modelcontextprotocol/client
angular: @tanstack/ai-mcp @modelcontextprotocol/client
vanilla: @tanstack/ai-mcp @modelcontextprotocol/client
octane: @tanstack/ai-mcp @modelcontextprotocol/client

<!-- ::end:tabs -->

Import the client from `@tanstack/ai-mcp`. Import the webhook and the store from `@tanstack/ai-mcp/events`. Keep the store on the server. It holds HMAC secrets.

## Pick a mode

| Mode | Option | What you get |
|---|---|---|
| Discovery | omit `experimental_events` | `list()` only |
| Direct | `{ store }` | `list`, `subscribe`, `refresh`, `unsubscribe` |
| Managed | `{ adapter }` | `list` over MCP, subscribe through a host such as Vercel Connect |

The client option is `experimental_events`. The `./events` exports have no `experimental_` prefix. They are tagged `@experimental`.

## List events

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://mcp.example.com/mcp',
  },
})

const events = await mcp.experimental_events.list()
```

`list()` works without a store. `subscribe` throws until you pass `{ store }` or `{ adapter }`.

The client sends `events/*` only when the server advertised Events:

1. `capabilities.extensions["io.modelcontextprotocol/events"]` (SEP-3415)
2. or `capabilities.experimental.events` (example servers)
3. or top-level `capabilities.events` (OpenAI ChatGPT / WG sketch)

SDK 2.1.0 `getServerCapabilities()` drops the top-level `events` key. The client reads that key from the raw `initialize` / `server/discover` result.

Otherwise it throws `MCPEventsUnsupportedError`.

## Subscribe (direct)

```ts group=direct-events
import { createMCPClient } from '@tanstack/ai-mcp'
import { inMemoryMCPEventStore } from '@tanstack/ai-mcp/events'

const store = inMemoryMCPEventStore()

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://mcp.example.com/mcp',
  },
  experimental_events: { store },
})

const sub = await mcp.experimental_events.subscribe({
  name: 'incident.created',
  arguments: { repo: 'acme/app' },
  delivery: {
    mode: 'webhook',
    url: 'https://app.example.com/api/mcp-events',
  },
})
```

`inMemoryMCPEventStore` is for development and tests. Put a durable store in production.

What subscribe does:

1. Writes a `pending` record before it calls the server.
2. Appends `mcp_event_subscription=<key>` to the callback URL.
3. Generates a `whsec_` secret if you did not pass one.
4. Stores `id`, `refreshBefore`, `cursor`, and `truncated` when the server answers.

Pass `allowInsecureLocalhost: true` only for `http://127.0.0.1` or `http://[::1]` in local tests.

Refresh is a second subscribe with the stored secret and cursor:

```ts group=direct-events
await mcp.experimental_events.refresh({ key: sub.key })
```

Unsubscribe sends `{ mode: 'webhook', url }` and deletes the local record. If the server returns NotFound, the local record is still deleted.

`MCPEventRequestError.kind` is `callback-endpoint` for SEP `-32027`. OpenAI servers may send `-32015` with `data.reason` in `connection_refused`, `timeout`, `tls_error`, `http_4xx`, `http_5xx`, or `challenge_failed`. The client maps that alias the same way. Any other `-32015` stays `kind: 'unknown'`.

## Receive webhooks

Handle the raw body. Do not parse JSON and stringify it again. The signature is HMAC-SHA256 over the exact bytes.

### TanStack Start

```ts ignore
import { createFileRoute } from '@tanstack/react-router'
import { createMCPEventWebhook, inMemoryMCPEventStore } from '@tanstack/ai-mcp/events'
import { queue } from './queue'

const store = inMemoryMCPEventStore()

const webhook = createMCPEventWebhook({
  store,
  onEvent: async ({ event, messageId }) => {
    await queue.send({ messageId, eventId: event.eventId, data: event.data })
  },
})

export const Route = createFileRoute('/api/mcp-events')({
  server: {
    handlers: {
      POST: ({ request }) => webhook(request),
    },
  },
})
```

### Next.js App Router

```ts
import { createMCPEventWebhook, inMemoryMCPEventStore } from '@tanstack/ai-mcp/events'
import { queue } from './queue'

const store = inMemoryMCPEventStore()
const webhook = createMCPEventWebhook({
  store,
  onEvent: async ({ event }) => {
    await queue.send(event)
  },
})

export async function POST(request: Request) {
  return webhook(request)
}
```

### Express

Read the raw buffer. Skip `express.json()` on this route.

```ts ignore
import express from 'express'
import { createMCPEventWebhook, inMemoryMCPEventStore } from '@tanstack/ai-mcp/events'
import { queue } from './queue'

const app = express()
const store = inMemoryMCPEventStore()
const webhook = createMCPEventWebhook({
  store,
  onEvent: async ({ event }) => {
    await queue.send(event)
  },
})

app.post(
  '/api/mcp-events',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value)
    }
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: 'POST',
      headers,
      body: req.body,
    })
    const response = await webhook(request)
    res.status(response.status)
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    res.end()
  },
)
```

## Receiver status codes

| Status | When |
|---|---|
| 204 | Event, gap, terminated, or verification challenge succeeded |
| 401 | Missing route key, bad signature, or timestamp outside ±300s |
| 400 | Body is not JSON or the envelope is invalid |
| 410 | Subscription is gone or the lease expired |
| 413 | Body larger than 256 KiB |
| 503 | `onEvent` / `onGap` / `onTerminated` or the store threw |

Return 503 so the server retries. Dedupe in your app on `(subscription.id, messageId)`.

## Renew leases

The SDK does not auto-refresh. Run a cron job over `store.list?.()`.

```ts
import type { MCPClient } from '@tanstack/ai-mcp'
import type { MCPEventStore } from '@tanstack/ai-mcp/events'

async function renewDue(store: MCPEventStore, mcp: MCPClient) {
  const events = mcp.experimental_events
  if (events === undefined) return
  const now = Date.now()
  const list = store.list
  if (list === undefined) return
  for await (const record of list()) {
    if (record.status !== 'active') continue
    if (record.refreshBefore === null || record.refreshBefore === undefined) {
      continue
    }
    const due = Date.parse(record.refreshBefore)
    if (Number.isNaN(due) || due - now > 60_000) continue
    await events.refresh({ key: record.key })
  }
}
```

## Cursors, gaps, and termination

| Payload | Handler | Store effect |
|---|---|---|
| Event | `onEvent` | Writes `event.cursor` when the field is present |
| `{ type: 'gap', cursor }` | `onGap` | Sets `cursor` and `truncated: true` |
| `{ type: 'terminated', error }` | `onTerminated` | Deletes the subscription |
| `{ type: 'verification', challenge }` | none | Echoes `{ challenge }` with 200 |

A gap means you missed events. Refresh with the stored cursor to resume.

## Security

1. Verify the Standard Webhooks `v1` signature on the raw body.
2. Reject timestamps outside ±300 seconds.
3. Cap the body at 256 KiB.
4. Require https callback URLs, except loopback http in tests.
5. Keep secrets out of logs. `onError` never receives the secret.

Do not treat `events/list` schemas as a security boundary. Pass `validateArguments` and `validatePayload` if you need checks.

## Feed an event into chat()

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  createMCPEventWebhook,
  inMemoryMCPEventStore,
} from '@tanstack/ai-mcp/events'

const store = inMemoryMCPEventStore()
const webhook = createMCPEventWebhook({
  store,
  onEvent: async ({ event }) => {
    const stream = chat({
      adapter: openaiText('gpt-5.6'),
      messages: [
        {
          role: 'user',
          content: `Incident ${event.eventId}: ${JSON.stringify(event.data)}`,
        },
      ],
    })
    for await (const chunk of stream) {
      void chunk
    }
  },
})
```

Close MCP clients after the stream drains if you also pass `mcp: { clients }`.

## Managed adapters

Pass `{ adapter }` when a host owns the webhook endpoint.

```ts
import { createMCPClient } from '@tanstack/ai-mcp'
import { adapter } from './adapter'

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://mcp.example.com/mcp',
  },
  experimental_events: { adapter },
})

await mcp.experimental_events.subscribe({
  name: 'incident.created',
  arguments: { repo: 'acme/app' },
  idempotencyKey: 'incident:acme/app',
  ttlMs: 3_600_000,
})
```

`createAdapter` is synchronous and runs before connect. The context is `{ type: 'http', url }`, `{ type: 'sse', url }`, or `{ type: 'custom' }`. There is no `refresh` in managed mode.

## Server emitter (illustrative)

This package does not ship `createMCPServer({ events })` yet. A low-level SDK `Server` can still advertise the extension:

```ts ignore
import { Server } from '@modelcontextprotocol/server'

const passThrough = {
  '~standard': {
    version: 1 as const,
    vendor: 'example',
    validate(value: unknown) {
      return { value }
    },
  },
}

const server = new Server(
  { name: 'incidents', version: '1.0.0' },
  {
    capabilities: {
      extensions: {
        'io.modelcontextprotocol/events': {},
      },
    },
  },
)

server.setRequestHandler('events/list', { params: passThrough }, async () => {
  return {
    events: [
      {
        name: 'incident.created',
        delivery: ['webhook'],
        inputSchema: { type: 'object' },
        payloadSchema: true,
      },
    ],
  }
})
```

Treat that snippet as a sketch. Production delivery needs a durable store, retries, and an SSRF guard.

## Troubleshooting

| Symptom | Check |
|---|---|
| `MCPEventsUnsupportedError` | The server did not advertise `extensions`, `experimental.events`, or `events` |
| 401 on every delivery | Middleware parsed the body. Use the raw bytes |
| 401 without a query string | A proxy dropped `mcp_event_subscription` |
| Duplicate `onEvent` calls | Dedupe on `messageId`. 503 after a store failure retries |
| Subscribe times out | The pending record stays. Call `refresh({ key })` |
| `Mcp-Name` missing | HTTP and SSE transports wrap `fetch` for `events/subscribe` and `events/unsubscribe`. Non-ASCII names use `=?base64?…?=` |

Next: follow [Subscribe to MCP Events](../tutorials/mcp-events), or put `createMCPEventWebhook` on a POST route and subscribe with `{ store }`.