---
title: Live data
id: generative-ui-live-data
order: 3
description: "Bind an artifact to a host data source so the view updates in real time. Register a streaming source, let the model bind to it, and push each value into the sandboxed frame."
keywords:
  - tanstack ai
  - generative ui
  - live data
  - DataSourceRegistry
  - dataSource
  - useHostData
  - subscribeData
  - real-time
---

A spend monitor, a price ticker, a status dashboard: the view should change on its own, without the model making a new artifact each time. The artifact stays the same. The data behind it keeps arriving.

You register a named data source on the host. The model binds an artifact to it by name. The host streams each new value into the sandboxed frame, and the view re-renders in place.

Live values are host data, like any other. The model renders what arrives. It does not compute it.

## Server: register a source

A data source is a function. It gets the binding's params and an `emit` callback, pushes values over time, and returns a cleanup function.

```ts
import { DataSourceRegistry } from '@tanstack/ai-generative-ui'

export const sources = new DataSourceRegistry()

sources.register(
  'spendFeed',
  (params, emit) => {
    let total = 0
    const timer = setInterval(() => {
      total += Math.round(Math.random() * 400)
      emit({ total, at: new Date().toISOString() })
    }, 1000)
    return () => clearInterval(timer) // runs when the view unmounts
  },
  {
    description: 'A live spend total that grows over time.',
    params: ['currency'],
    output: '{ total, at }',
  },
)
```

### Tell the model the source exists

The model can only bind to a source it knows about. Add the catalog to your system prompt with `describeDataSourcesForPrompt`, the same way compute functions are surfaced.

```ts ignore
import { describeDataSourcesForPrompt } from '@tanstack/ai-generative-ui'
import { sources } from './data-sources'

const systemPrompt = `You are a generative UI agent.

Bind a real-time view to a live data source with the create_artifact
"dataSource" field. Use only these sources:
${describeDataSourcesForPrompt(sources)}`
```

The model then calls `create_artifact` with a binding:

```json
{
  "kind": "react-tsx",
  "title": "Live spend monitor",
  "dataSource": { "name": "spendFeed" },
  "source": "..."
}
```

The binding persists on the artifact record and rides the `genui:artifact` event to the client.

## The artifact: read the live value

Inside the artifact, read the streamed value with `useHostData()`. It is `undefined` until the first value arrives, so always give it a default before you read a field.

```tsx ignore
import { useHostData } from '@ogui/bridge'

export default function LiveSpendMonitor() {
  const feed = useHostData() || { total: 0 }
  return <h2>{'$' + feed.total.toLocaleString()}</h2>
}
```

## Client: stream the source into the frame

The host registry runs on the server. The frame renders in the browser. You bridge them with one transport (server-sent events is a good fit) and hand `FrameArtifactRenderer` a `subscribeData` function.

`subscribeData` gets an `emit` callback. Call it for each value. Return an unsubscribe. The renderer pushes every value into the frame, where `useHostData()` re-renders.

```tsx ignore
import { FrameArtifactRenderer } from '@tanstack/ai-generative-ui'

// `pin` carries `dataSource` from the genui:artifact event.
function LiveFrame({ pin }) {
  const subscribeData = pin.dataSource
    ? (emit) => {
        const es = new EventSource(`/api/live?source=${pin.dataSource.name}`)
        es.onmessage = (e) => emit(JSON.parse(e.data))
        return () => es.close()
      }
    : undefined

  return (
    <FrameArtifactRenderer
      pin={pin}
      sandboxUrl={sandboxUrl}
      subscribeData={subscribeData}
    />
  )
}
```

On the server, the `/api/live` route subscribes to the named source and writes each value as an SSE message:

```ts ignore
// src/routes/api.live.ts
import { sources } from './data-sources'

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get('source') ?? ''
  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = sources.subscribe(name, {}, (value) => {
        controller.enqueue(`data: ${JSON.stringify(value)}\n\n`)
      })
      request.signal.addEventListener('abort', unsubscribe)
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}
```

An artifact with no `dataSource` never gets a `subscribeData`, so it keeps its one-time snapshot. Only bound views stream.

The [`examples/generative-ui`](https://github.com/TanStack/ai/tree/main/examples/generative-ui) app has the full version: a `spendFeed` source, the `/api/live` route, and a live spend monitor that ticks on load.
