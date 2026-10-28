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

# @tanstack/ai-durable-stream

Delivery durability for TanStack AI over the durable-streams HTTP protocol — a resumable `StreamDurability` transport sink that stores zero delivery events itself.

`durableStream(request, options)` is the production adapter for [Resumable Streams](https://tanstack.com/ai/latest/docs/resumable-streams/overview): when a client's connection drops mid-answer, it reconnects and the run is replayed from a log instead of re-run. `memoryStream` from `@tanstack/ai` keeps that log in process memory for development; this package writes it to an external [Durable Streams](https://durablestreams.com) backend, so it works when requests span many processes — and because the producer runs against the backend rather than the client's socket, a reconnect can pick up a run that is still producing.

## Installation

```bash
npm install @tanstack/ai-durable-stream
# or
pnpm add @tanstack/ai-durable-stream
# or
yarn add @tanstack/ai-durable-stream
```

## Usage

Wrap the response with the adapter. Everything else about the route stays the same as with `memoryStream`.

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { durableStream } from '@tanstack/ai-durable-stream'
import { openaiText } from '@tanstack/ai-openai'
import { getDurableStreamsToken } from './auth'

const durableOptions = {
  server: 'https://streams.example.com',
  streamPrefix: 'chat-runs',
  headers: async () => ({
    Authorization: `Bearer ${await getDurableStreamsToken()}`,
  }),
}

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: durableStream(request, durableOptions), batch: 32 },
  })
}
```

Add a `GET` on the same route that replays the run — `resumeServerSentEventsResponse({ adapter: durableStream(request, durableOptions) })` — and the client reconnects to it; the [Overview](https://tanstack.com/ai/latest/docs/resumable-streams/overview) has the full handler and the one gotcha (guard your side effects behind `resumeFrom()` so a reconnect does not run them twice).

### Options

- `server` — base URL of the Durable Streams backend.
- `streamPrefix` — prefix for the stream names the adapter creates.
- `headers` — a static object for fixed credentials, or an async resolver for rotating tokens. The resolver runs for every create, append, read, and close.
- `fetch` — injectable `fetch`, for routing through something other than the network (see below).
- `batch` (on `durability`, not the adapter) — how many chunks are buffered per log append; default 32.

The backend must return a non-empty `Stream-Next-Offset` header on create, append, and close; a missing header fails loudly with `DurableStreamError`. The adapter never guesses an offset.

### On Cloudflare

Durable Streams ships a Workers + Durable Objects backend that speaks this protocol, so `durableStream` talks to it with no extra adapter. When your endpoint also runs on Workers, pass the service binding's `fetch` and skip `server`:

```typescript
import { durableStream } from '@tanstack/ai-durable-stream'

interface Env {
  DURABLE_STREAMS: { fetch: typeof fetch }
}

function cloudflareAdapter(request: Request, env: Env) {
  return durableStream(request, {
    streamPrefix: 'chat-runs',
    fetch: env.DURABLE_STREAMS.fetch.bind(env.DURABLE_STREAMS),
  })
}
```

## What it is not

The durability log replays chunks. It answers "what did this run stream?", not "what has this user said?" — keep authoritative conversation state in your own storage, for example with [`@tanstack/ai-persistence`](https://tanstack.com/ai/latest/docs/persistence/overview).

`durableStream` returns a plain `StreamDurability` with no `upsert`: offsets embed a backend-assigned cursor, so code that requires `UpsertableStreamDurability` fails to compile at the wiring site rather than at run time.

## Documentation

- [Resumable Streams overview](https://tanstack.com/ai/latest/docs/resumable-streams/overview): pick an adapter, wrap the response, add the `GET`
- [Advanced](https://tanstack.com/ai/latest/docs/resumable-streams/advanced): every `durableStream` option, reconnection bounding, offset ownership, Cloudflare deployment, process death

## License

MIT
