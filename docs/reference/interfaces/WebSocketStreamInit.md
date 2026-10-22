---
id: WebSocketStreamInit
title: WebSocketStreamInit
---

Defined in: packages/ai/src/stream-to-websocket.ts:90

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Properties

### batch?

```ts
optional batch?: number;
```

Defined in: packages/ai/src/stream-to-websocket.ts:96

Chunks buffered per durability append (default 32).

***

### batchWaitMs?

```ts
optional batchWaitMs?: number;
```

Defined in: packages/ai/src/stream-to-websocket.ts:101

Most ms a chunk waits in the batch for the next one before the batch is
appended and sent anyway (default 50). `0` appends every chunk on its own.

***

### debug?

```ts
optional debug?: DebugOption;
```

Defined in: packages/ai/src/stream-to-websocket.ts:110

***

### durability?

```ts
optional durability?: (ctx) => StreamDurability<TOffset>;
```

Defined in: packages/ai/src/stream-to-websocket.ts:94

Per-TURN durability factory, keyed by the frame's runId via ctx.request.

#### Parameters

##### ctx

[`WsRunContext`](WsRunContext.md)

#### Returns

[`StreamDurability`](StreamDurability.md)\<`TOffset`\>

***

### heartbeatMs?

```ts
optional heartbeatMs?: number;
```

Defined in: packages/ai/src/stream-to-websocket.ts:103

Heartbeat ping interval in ms (default 30_000).

***

### idleTimeoutMs?

```ts
optional idleTimeoutMs?: number;
```

Defined in: packages/ai/src/stream-to-websocket.ts:109

Close after this many ms without any inbound frame (default 300_000).
Never fires while a turn is still streaming, so a long single generation
(agentic loop, >5-min turn) is safe.

***

### onRun

```ts
onRun: (ctx) => AsyncIterable<AGUIEvent>;
```

Defined in: packages/ai/src/stream-to-websocket.ts:92

Build a fresh chat() stream for each inbound RunAgentInput frame.

#### Parameters

##### ctx

[`WsRunContext`](WsRunContext.md)

#### Returns

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>
