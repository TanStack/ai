---
id: memoryStream
title: memoryStream
---

# Function: memoryStream()

```ts
function memoryStream(request): StreamDurability;
```

Defined in: [packages/ai/src/stream-durability.ts:239](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L239)

The zero-infrastructure [StreamDurability](../interfaces/StreamDurability.md) backend: an in-process log.

Perfect for local dev and tests — a reconnect or second tab that reaches the
same process replays the ordered stream. It does NOT survive a restart and is
NOT shared across server instances; swap in `durableStream` from
`@tanstack/ai-durable-stream` for production.

## Parameters

### request

`Request`

## Returns

[`StreamDurability`](../interfaces/StreamDurability.md)
