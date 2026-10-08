---
id: toJsonResponse
title: toJsonResponse
---

## Call Signature

```ts
function toJsonResponse(result, init?): Promise<Response>;
```

Defined in: [packages/ai/src/stream-to-response.ts:1620](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L1620)

Send a chat run as one JSON body, for hosts that cannot stream a response.
Pair it with the `fetchJson` connection adapter.

The body is `{ chunks, offset?, done }`:
- `chunks`: every chunk, encoded for the wire like the SSE and NDJSON helpers.
- `offset`: the durable offset of the last chunk (durable routes only).
- `done`: `false` when the run is still going. The client asks again with
  `GET ?runId=<id>&offset=<offset>`, served by [resumeJsonResponse](resumeJsonResponse.md).

Pass a `ChatResult` from `chat({ stream: false })` to send it as is. Pass a
stream to read it here. Without `durability` the stream is read to its end.
With `durability`, a fresh run fills the log, and the reply goes out when the
run ends or when `maxWaitMs` passes, whichever is first. The run keeps going
after an early reply. A request with a resume offset reads the log instead.

### Parameters

#### result

[`ChatResult`](../interfaces/ChatResult.md)

#### init?

`ResponseInit`

Response init. For a stream, also `abortController`, `signal`, `maxWaitMs`, `durability`, and `debug`.

### Returns

`Promise`\<`Response`\>

A promise of a JSON Response

### Example

```typescript
// A finished result
export async function POST(request: Request) {
  const result = await chat({
    adapter: openaiText('gpt-5.5'),
    messages: [...],
    stream: false,
  });
  return toJsonResponse(result);
}

// A durable stream that replies at least once a second
export async function POST(request: Request) {
  const stream = chat({ adapter: openaiText('gpt-5.5'), messages: [...] });
  return toJsonResponse(stream, {
    durability: { adapter: memoryStream(request) },
    signal: request.signal,
    maxWaitMs: 1000,
  });
}
```

## Call Signature

```ts
function toJsonResponse<TOffset>(stream, init?): Promise<Response>;
```

Defined in: [packages/ai/src/stream-to-response.ts:1624](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L1624)

Send a chat run as one JSON body, for hosts that cannot stream a response.
Pair it with the `fetchJson` connection adapter.

The body is `{ chunks, offset?, done }`:
- `chunks`: every chunk, encoded for the wire like the SSE and NDJSON helpers.
- `offset`: the durable offset of the last chunk (durable routes only).
- `done`: `false` when the run is still going. The client asks again with
  `GET ?runId=<id>&offset=<offset>`, served by [resumeJsonResponse](resumeJsonResponse.md).

Pass a `ChatResult` from `chat({ stream: false })` to send it as is. Pass a
stream to read it here. Without `durability` the stream is read to its end.
With `durability`, a fresh run fills the log, and the reply goes out when the
run ends or when `maxWaitMs` passes, whichever is first. The run keeps going
after an early reply. A request with a resume offset reads the log instead.

### Type Parameters

#### TOffset

`TOffset` *extends* `string` = `string`

### Parameters

#### stream

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

#### init?

`JsonResponseInit`\<`TOffset`\>

Response init. For a stream, also `abortController`, `signal`, `maxWaitMs`, `durability`, and `debug`.

### Returns

`Promise`\<`Response`\>

A promise of a JSON Response

### Example

```typescript
// A finished result
export async function POST(request: Request) {
  const result = await chat({
    adapter: openaiText('gpt-5.5'),
    messages: [...],
    stream: false,
  });
  return toJsonResponse(result);
}

// A durable stream that replies at least once a second
export async function POST(request: Request) {
  const stream = chat({ adapter: openaiText('gpt-5.5'), messages: [...] });
  return toJsonResponse(stream, {
    durability: { adapter: memoryStream(request) },
    signal: request.signal,
    maxWaitMs: 1000,
  });
}
```
