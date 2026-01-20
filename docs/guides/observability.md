---
title: Observability
id: observability
order: 10
---

# Event client

The `@tanstack/ai` package offers you an event client for observability and debugging purposes.
It's a fully type-safe decoupled event-driven system that emits events whenever they are internally
triggered and you can subscribe to those events for observability.

Because the same event client is used for both the TanStack Devtools system and observability locally it will work
by subscribing to the event bus and emitting events to/from the event bus into the listeners by default. If you 
want to subscribe to events in production as well you need to pass in a third argument to the `on` function,
the `{ withEventTarget: true }` option.

This will not only emit to the event bus (which is not present in production), but to the current eventTarget that
you will be able to listen to. 

## Event naming scheme

Events follow the format `<system-part>:<what-it-does>`.

- Text: `text:request:started`, `text:message:created`, `text:chunk:content`, `text:usage`
- Tools: `tools:approval:requested`, `tools:call:completed`, `tools:result:added`
- Summarize: `summarize:request:started`, `summarize:usage`
- Image: `image:request:started`, `image:usage`
- Speech: `speech:request:started`, `speech:usage`
- Transcription: `transcription:request:started`, `transcription:usage`
- Video: `video:request:started`, `video:usage`
- Client: `client:created`, `client:loading:changed`, `client:messages:cleared`

Every event includes all metadata available at the time of emission (model, provider,
system prompts, request and message IDs, options, and tool names).

## Server events

There are both events that happen on the server and on the client, if you want to listen to either side you just need to
subscribe on the server/client respectfully. 

Here is an example for the server:
```ts
import { aiEventClient } from "@tanstack/ai/event-client";

// server.ts file or wherever the root of your server is
aiEventClient.on("text:request:started", e => {
  // implement whatever you need to here
})
// rest of your server logic
const app = new Server();
app.get()
```

## Client events

Listening on the client is the same approach, just subscribe to the events:

```tsx
// App.tsx
import { aiEventClient } from "@tanstack/ai/event-client";

const App = () => {
  useEffect(() => {
    const cleanup = aiEventClient.on("tools:call:updated", e => {
      // do whatever you need to do
    })
    return cleanup;
  },[])
  return <div></div>
}
```

## Reconstructing chat

To rebuild a chat timeline from events, listen for:

- `text:message:created` (full message content)
- `text:message:user` (explicit user message events)
- `text:chunk:*` (streaming content, tool calls, tool results, thinking)
- `tools:*` (approvals, input availability, call completion)
- `text:request:completed` (final completion + usage)

This set is sufficient to replay the conversation end-to-end for observability and
telemetry systems.

 