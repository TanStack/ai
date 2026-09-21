<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-event-client

Typed event client for TanStack AI devtools, observability, and streamed runtime events.

Every TanStack AI activity, middleware, and client emits its lifecycle on one shared event bus, `aiEventClient`. The devtools panel reads it, and so can you: subscribe to see runs start and finish, tools get called, or memory get recalled, without touching the code that produces them. The bus is a single instance per runtime (stored on `globalThis`), so the core, the client packages, and your own code all see the same events.

This package is a dependency of `@tanstack/ai`, `@tanstack/ai-client`, `@tanstack/ai-devtools`, and `@tanstack/ai-memory`; you usually get it transitively.

## Installation

```bash
npm install @tanstack/ai-event-client
# or
pnpm add @tanstack/ai-event-client
# or
yarn add @tanstack/ai-event-client
```

## Usage

`aiEventClient.on(eventName, handler)` returns an unsubscribe function. Event names and payloads are typed through `AIDevtoolsEventMap`, so the handler's `event.payload` is narrowed to the event you subscribed to.

```typescript
import { aiEventClient } from '@tanstack/ai-event-client'

const off = aiEventClient.on('run:completed', (event) => {
  console.log(event.payload)
})

// later
off()
```

For example, `memoryMiddleware` emits `memory:retrieve:started` / `memory:retrieve:completed` around every recall and `memory:persist:started` / `memory:persist:completed` around every save, with `memory:error` when an adapter throws; see [Operating memory](https://tanstack.com/ai/latest/docs/memory/operating).

## Event groups

Names are `group:subject` or `group:subject:phase`. The groups on `AIDevtoolsEventMap`:

| Group                                                                                | What it covers                                                                           |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `run:*`                                                                              | `chat()` run lifecycle: created, started, completed, errored, cancelled                  |
| `text:*`, `tools:*`, `structured-output:*`                                           | Streaming text, tool calls and results, structured output                                |
| `image:*`, `video:*`, `speech:*`, `audio:*`, `transcription:*`, `voice:*`, `world:*` | Generation activities: request started / completed / error, plus `usage`                 |
| `embedding:*`, `rerank:*`, `summarize:*`, `evaluate:*`                               | The other activities, same request / usage shape                                         |
| `middleware:*`                                                                       | Which hook ran and what it transformed                                                   |
| `memory:*`, `compaction:*`, `skills:*`                                               | Memory recall / persist, context compaction, agent skills                                |
| `hook:*`, `client:*`                                                                 | Client-side hooks (`useChat` and friends) registering, updating, loading, erroring       |
| `devtools:*`                                                                         | Panel opened / closed and requests the panel sends back, such as applying a tool fixture |

## Envelope helpers

Events carry a common envelope — `eventId`, `eventType`, `timestamp`, `source` (`client` | `server` | `devtools`), `visibility`, and optional correlation ids such as `runId`, `threadId`, `messageId`, `toolCallId`. The package exports the helpers the emitters use to build and dedupe it:

- `createAIDevtoolsEventEnvelope(input)` — fills in `eventId` and `runtimeId` when absent
- `getAIDevtoolsDedupeKey(event)` — stable key for an event: its `eventId` when present, otherwise derived from `source`, `eventType`, `visibility`, the correlation ids, and the timestamp
- `getAIDevtoolsRuntimeId()` — the id of the current runtime instance

## License

MIT
