---
id: StreamDurability
title: StreamDurability
---

# Interface: StreamDurability

Defined in: [packages/ai/src/stream-durability.ts:21](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L21)

A pluggable sink for **delivery durability** — the transport-layer concern of
letting a client disconnect, reload, or open a second tab and still receive
the full, ordered run stream exactly once.

This is deliberately thin: append / read / resume-detect and nothing else. It
stores no run status, no messages, no interrupts — those are *state*
durability (the middleware layer). Keeping this interface small is what stops
delivery durability drifting back into "a transport wearing a store costume".

Adapters close over the incoming `Request` (that is why they are constructed
as `memoryStream(request)` / `durableStream(request, opts)`), so `request`
never pollutes the transport-helper signature.

Offsets are opaque strings of the form `runId@seq` (see [encodeOffset](../functions/encodeOffset.md)).
The sentinels `-1` (from the start) and `now` (tail — only future writes) may
appear in the seq position.

## Properties

### append()

```ts
append: (chunks, startSeq) => Promise<(string | undefined)[]>;
```

Defined in: [packages/ai/src/stream-durability.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L54)

Append a batch of chunks. The first chunk takes sequence number `startSeq`,
the next `startSeq + 1`, and so on (sequence numbers are 1-based).

Resolves to a per-chunk array of the **resume offsets the transport should
tag each chunk with** (its client-facing SSE `id:`), aligned position-for-
position with `chunks`. An element is `undefined` when that chunk carries
no resumable offset.

The offsets MUST be the offsets the backend will actually accept on a
`read(offset)` resume — never a transport-local counter — so a reconnect
resumes against the real backend key space:

- [memoryStream](../functions/memoryStream.md) tags **every** chunk (`runId@seq`), because its log
  is per-chunk addressable.
- A batched remote backend (e.g. `durableStream`) may only learn a
  per-BATCH offset from its append response, so it tags only the batch's
  **last** chunk (the rest are `undefined`); resume granularity is then
  per-batch and a partial-batch replay is de-duped by the client.

#### Parameters

##### chunks

[`AGUIEvent`](../type-aliases/AGUIEvent.md)[]

##### startSeq

`number`

#### Returns

`Promise`\<(`string` \| `undefined`)[]\>

***

### markComplete()?

```ts
optional markComplete: () => void;
```

Defined in: [packages/ai/src/stream-durability.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L71)

Mark the run terminated so a concurrently live-tailing [read](#read) (a
mid-stream join / reconnect) stops waiting for further appends and returns.
Called by the producer when the source stream ends — whether it ended with
a terminal event, a thrown error, or simply ran dry. Optional: backends
that detect completion from the stored terminal event (or their own
close signal) need not implement it.

#### Returns

`void`

***

### read()

```ts
read: (offset) => AsyncIterable<{
  chunk: AGUIEvent;
  seq: number;
}>;
```

Defined in: [packages/ai/src/stream-durability.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L62)

Replay the chunks strictly after `offset`. Pass `-1` (or an offset whose
seq is `-1`) to replay from the start. Yields `{ seq, chunk }` in order.

#### Parameters

##### offset

`string`

#### Returns

`AsyncIterable`\<\{
  `chunk`: [`AGUIEvent`](../type-aliases/AGUIEvent.md);
  `seq`: `number`;
\}\>

***

### resumeFrom()

```ts
resumeFrom: () => string | null;
```

Defined in: [packages/ai/src/stream-durability.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L27)

The offset to resume from, read off the captured request — the
`Last-Event-ID` header (native `EventSource` reconnect) or, failing that,
the `?offset` query param. Returns `null` for a fresh run (produce path).

#### Returns

`string` \| `null`

***

### runId()

```ts
runId: () => string;
```

Defined in: [packages/ai/src/stream-durability.ts:33](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L33)

The stable run/stream id for this request. Minted (`crypto.randomUUID()`)
for a fresh run; parsed from the resume offset / `?runId` param otherwise.
Memoized so repeated calls return the same id.

#### Returns

`string`
