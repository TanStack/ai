---
title: Subscribe to MCP Events
id: subscribe-mcp-events
order: 6
description: "Subscribe to an MCP Events webhook in a TanStack Start app and receive a signed delivery."
keywords:
  - tanstack ai
  - tutorial
  - mcp
  - mcp events
  - webhook
  - sep-3415
  - tanstack start
---

An MCP server can push work to you: a new incident, a finished job. Polling that server is slow and easy to miss.

This tutorial subscribes to `incident.created` from a TanStack Start app. A POST route verifies the Standard Webhooks signature with `createMCPEventWebhook`. The page then shows the event.

The sample app also hosts a small in-process MCP Events server so you can emit a delivery without a live remote. Production apps subscribe to the real server over HTTP.

The short guide is [MCP Events](../tools/mcp-events).

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Then install this package:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mcp

<!-- ::end:tabs -->

## The webhook, the helper, and the page

The webhook route is the callback URL you pass to `subscribe`.

The helper file keeps the store, the webhook handler, and a loopback MCP Events server.

The page calls subscribe, then emit, and shows the verified event.

## 2. Receive the webhook

Create `src/routes/api.mcp-events.ts`.

`createMCPEventWebhook` reads the raw body and checks the HMAC. Do not parse JSON and stringify it again.

```ts ignore
import { createFileRoute } from '@tanstack/react-router'
import { handleWebhook } from '../lib/desk'

export const Route = createFileRoute('/api/mcp-events')({
  server: {
    handlers: {
      POST: ({ request }) => handleWebhook(request),
    },
  },
})
```

## 3. Subscribe and emit

Create `src/lib/desk.ts`. Copy it from the example app.

That file does three jobs:

- Share one `inMemoryMCPEventStore` between subscribe and the webhook.
- Host a small MCP Events server so you can click Emit without a remote.
- Sign a Standard Webhooks body and pass it to `createMCPEventWebhook`.

`subscribeDesk` uses a loopback `Transport` so the page does not fetch itself. Use `allowInsecureLocalhost: true` only for `http://127.0.0.1` in local tests.

`inMemoryMCPEventStore` is for this sample. Put a durable store in production.

The subscribe call inside `subscribeDesk` is:

```ts ignore
const sub = await client.experimental_events.subscribe({
  name: 'incident.created',
  delivery: {
    mode: 'webhook',
    url: 'http://127.0.0.1/api/mcp-events',
    allowInsecureLocalhost: true,
  },
})
```

## 4. Show the event

Create `src/routes/index.tsx`.

The page calls `subscribeDesk`, then `emitDesk`, and prints the last verified event.

```tsx ignore
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { emitDesk, subscribeDesk } from '@/lib/desk'
import type { DeskSnapshot } from '@/lib/desk'

function McpEventsPage() {
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<'subscribe' | 'emit' | ''>('')

  async function onSubscribe() {
    setError('')
    setPending('subscribe')
    try {
      setSnapshot(await subscribeDesk())
    } catch (caught) {
      setSnapshot(null)
      setError(caught instanceof Error ? caught.message : 'Subscribe failed.')
    } finally {
      setPending('')
    }
  }

  async function onEmit() {
    setError('')
    setPending('emit')
    try {
      setSnapshot(await emitDesk())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Emit failed.')
    } finally {
      setPending('')
    }
  }

  const last = snapshot?.events[snapshot.events.length - 1]

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-3xl font-bold text-white">Incident desk</h1>
      <p className="mb-6 text-gray-300">
        Subscribe to <code>incident.created</code>, then emit a signed webhook.
        This page shows the event that <code>createMCPEventWebhook</code>{' '}
        verified.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          className="rounded bg-white px-4 py-2 font-semibold text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
          disabled={pending !== ''}
          onClick={() => {
            void onSubscribe()
          }}
        >
          {pending === 'subscribe' ? 'Subscribing' : 'Subscribe'}
        </button>
        <button
          type="button"
          className="rounded bg-emerald-400 px-4 py-2 font-semibold text-gray-900 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
          disabled={pending !== '' || snapshot === null}
          onClick={() => {
            void onEmit()
          }}
        >
          {pending === 'emit' ? 'Emitting' : 'Emit incident'}
        </button>
      </div>
      {error !== '' ? (
        <p className="mt-4 text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {snapshot !== null ? (
        <div className="mt-8 space-y-6 text-gray-100">
          <section>
            <h2 className="text-xl font-semibold">Catalog</h2>
            <p>{snapshot.names.join(', ')}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold">Subscription</h2>
            <p>{snapshot.subscriptionId ?? 'none'}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold">Last event</h2>
            {last === undefined ? (
              <p>No delivery yet. Click Emit incident.</p>
            ) : (
              <pre className="whitespace-pre-wrap rounded bg-gray-800 p-4">
                {JSON.stringify(last, null, 2)}
              </pre>
            )}
          </section>
        </div>
      ) : null}
    </main>
  )
}

export const Route = createFileRoute('/')({
  component: McpEventsPage,
})
```

## 5. Run the app

1. In the app folder, run `pnpm dev`.
2. Open http://127.0.0.1:3100.
3. Click Subscribe, then Emit incident.

The page shows `incident.created`, a subscription id, and the verified payload with `id: "inc_desk"`.

<!-- ::client-example library=ai framework=react slug=mcp-events -->

The full example is on GitHub: [TanStack/ai `examples/react/mcp-events`](https://github.com/TanStack/ai/tree/main/examples/react/mcp-events).

For leases, gaps, and status codes, open [MCP Events](../tools/mcp-events).
