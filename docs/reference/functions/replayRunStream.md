---
id: replayRunStream
title: replayRunStream
---

# Function: replayRunStream()

```ts
function replayRunStream<TOffset>(
   durability, 
   offset?, 
signal?): AsyncGenerator<AGUIEvent>;
```

Defined in: [packages/ai/src/stream-durability.ts:588](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L588)

Replay a run's delivery-durability log as a bare stream of chunks, for
callers that serve a `joinRun` handler without an HTTP `Response` — e.g. a
TanStack Start server function returning an async iterable:

```ts
async function* joinImageRun({ data: runId }: { data: string }) {
  yield* replayRunStream(memoryStream({ runId }))
}

// Serve it from a server function whose handler is the generator above
// (`createServerFn({ method: 'GET' }).inputValidator(...)`).
```

NOTE: the example deliberately declares the generator separately instead of
inlining it into the server-fn builder chain. TanStack Start's server-fn
Vite plugin decides whether a module needs compiling by regex-matching the
SOURCE for a dotted `handler(` call, and JSDoc survives into `dist` — an
inlined chain here would make every Start app treat this package as a
server-fn module and try to resolve its framework's `@tanstack/*-start`
package, failing the build wherever that framework is not the one installed.

Reads from `offset` (default `'-1'` — from the start) and tails until the
producer closes the log or `signal` aborts, exactly like the HTTP
`resumeServerSentEventsResponse` path.

## Type Parameters

### TOffset

`TOffset` *extends* `string`

## Parameters

### durability

[`StreamDurability`](../interfaces/StreamDurability.md)\<`TOffset`\>

### offset?

`TOffset`

### signal?

`AbortSignal`

## Returns

`AsyncGenerator`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>
