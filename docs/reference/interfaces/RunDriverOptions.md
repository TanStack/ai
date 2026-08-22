---
id: RunDriverOptions
title: RunDriverOptions
---

# Interface: RunDriverOptions

Defined in: [packages/ai/src/stream-to-response.ts:799](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L799)

Everything the resume helpers need to take a run over as a side effect of
serving its log.

`claim` and `pipe` are **injected**, not imported. The two mechanisms a
takeover needs (`withRunClaim` and `pipeToRunLog`) live in
`@tanstack/ai-sandbox`, and `@tanstack/ai` must not depend on that package —
that layering inversion is exactly what moving `LockStore` into core was meant
to prevent, and it would make core depend on the sandbox package to serve a
plain chat run. Injecting them keeps only the *shape* of a takeover in core
(parse the run id, read the record, skip if terminal, claim, drive) and lets a
background-worker-driven run supply its own pair.
`@tanstack/ai-sandbox`'s `sandboxRunDriver` fills both in.

## Properties

### claim

```ts
claim: <T>(input, fn) => Promise<T>;
```

Defined in: [packages/ai/src/stream-to-response.ts:811](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L811)

Run `fn` under exclusive ownership of the run, or reject if refused.

#### Type Parameters

##### T

`T`

#### Parameters

##### input

###### locks

`LockStore`

###### runId

`string`

###### runs

[`RunStore`](RunStore.md)

##### fn

(`claim`) => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

***

### drive

```ts
drive: (input) => AsyncIterable<AGUIEvent>;
```

Defined in: [packages/ai/src/stream-to-response.ts:805](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L805)

Produce the run's remaining events. Called only once the claim is held.

#### Parameters

##### input

###### runId

`string`

###### signal

`AbortSignal`

###### threadId

`string`

#### Returns

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

***

### locks

```ts
locks: LockStore;
```

Defined in: [packages/ai/src/stream-to-response.ts:803](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L803)

***

### logger?

```ts
optional logger?: InternalLogger;
```

Defined in: [packages/ai/src/stream-to-response.ts:826](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L826)

***

### pipe

```ts
pipe: (stream, input) => Promise<unknown>;
```

Defined in: [packages/ai/src/stream-to-response.ts:820](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L820)

Persist the driven stream to the run's producer-side durability log.

#### Parameters

##### stream

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

##### input

###### runId

`string`

###### signal

`AbortSignal`

###### threadId

`string`

#### Returns

`Promise`\<`unknown`\>

***

### request

```ts
request: Request;
```

Defined in: [packages/ai/src/stream-to-response.ts:801](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L801)

The attach request; its run id is read with [resolveResumeRunId](../functions/resolveResumeRunId.md).

***

### runs

```ts
runs: RunStore;
```

Defined in: [packages/ai/src/stream-to-response.ts:802](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L802)

***

### waitUntil?

```ts
optional waitUntil?: (promise) => void;
```

Defined in: [packages/ai/src/stream-to-response.ts:825](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L825)

Platform keep-alive (e.g. `ctx.waitUntil`) for the background drive.

#### Parameters

##### promise

`Promise`\<`unknown`\>

#### Returns

`void`
