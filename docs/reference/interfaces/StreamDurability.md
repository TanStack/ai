---
id: StreamDurability
title: StreamDurability
---

# Interface: StreamDurability\<TOffset\>

Defined in: [packages/ai/src/stream-durability.ts:10](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L10)

A pluggable delivery-durability backend.

Offsets are owned by the adapter and opaque to the transport. The generic
parameter lets an adapter retain a branded string type across append, read,
and resume without requiring core to understand its cursor format.

## Extended by

- [`UpsertableStreamDurability`](UpsertableStreamDurability.md)

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Properties

### append

```ts
append: (chunks) => Promise<TOffset[]>;
```

Defined in: [packages/ai/src/stream-durability.ts:17](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L17)

Persist a batch before it is delivered and return exactly one resumable
offset for each chunk, in the same order.

#### Parameters

##### chunks

[`AGUIEvent`](../type-aliases/AGUIEvent.md)[]

#### Returns

`Promise`\<`TOffset`[]\>

***

### close

```ts
close: () => Promise<void>;
```

Defined in: [packages/ai/src/stream-durability.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L27)

Terminalize the producer log and unblock live readers. Core awaits this
for every producer exit, including completion, cancellation, and failure.

#### Returns

`Promise`\<`void`\>

***

### read

```ts
read: (offset, signal?) => AsyncIterable<{
  chunk: AGUIEvent;
  offset: TOffset;
}>;
```

Defined in: [packages/ai/src/stream-durability.ts:19](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L19)

Replay chunks strictly after the supplied adapter-owned offset.

#### Parameters

##### offset

`TOffset`

##### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<\{
  `chunk`: [`AGUIEvent`](../type-aliases/AGUIEvent.md);
  `offset`: `TOffset`;
\}\>

***

### resumeFrom

```ts
resumeFrom: () => TOffset | null;
```

Defined in: [packages/ai/src/stream-durability.ts:12](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L12)

Return the adapter offset captured from the request, or null for a producer.

#### Returns

`TOffset` \| `null`

***

### snapshot

```ts
snapshot: () => Promise<object[]>;
```

Defined in: [packages/ai/src/stream-durability.ts:57](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L57)

Everything stored for this run **at the moment of the call**, in append
order, then resolve.

This is the bounded counterpart to [StreamDurability.read](#read). `read`
tails: it parks until the log is terminalized or the caller aborts, so it
cannot be used to inspect a log whose producer died without calling
`close` — that log stays open forever and a `for await` over it never
finishes. `snapshot` exists for exactly that case: a producer resuming a
run needs to see the prefix a previous host already stored so it can line
its own output up against it, and it needs that read to *return*.

Implementations MUST:

- never wait for more entries — resolve with what is stored, including
  while the log is still open and still being appended to;
- resolve to an empty array for a run with nothing stored, rather than
  throwing. In particular an implementation must not reuse the
  unknown-run failure path a from-start `read` join takes (`read('-1')` on
  an empty log is allowed to fail; `snapshot()` is not). A backend over a
  network may of course still reject on a transport, protocol, or
  authorization failure — that is a failed call, not an empty run;
- return a fresh array the caller can keep or mutate without reaching the
  stored log through it.

The result is a point-in-time view and carries no lock: a concurrent
`append` may land immediately after the snapshot is taken, so a caller
must not treat the last returned offset as the permanent tail.

#### Returns

`Promise`\<`object`[]\>
