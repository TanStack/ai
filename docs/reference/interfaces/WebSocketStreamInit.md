---
id: WebSocketStreamInit
title: WebSocketStreamInit
---

# Interface: WebSocketStreamInit\<TOffset\>

Defined in: [packages/ai/src/stream-to-websocket.ts:90](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L90)

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Properties

### batch?

```ts
optional batch?: number;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:96](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L96)

Chunks buffered per durability append (default 32).

***

### debug?

```ts
optional debug?: DebugOption;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:105](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L105)

***

### durability?

```ts
optional durability?: (ctx) => StreamDurability<TOffset>;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L94)

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

Defined in: [packages/ai/src/stream-to-websocket.ts:98](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L98)

Heartbeat ping interval in ms (default 30_000).

***

### idleTimeoutMs?

```ts
optional idleTimeoutMs?: number;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L104)

Close after this many ms without any inbound frame (default 300_000).
Never fires while a turn is still streaming, so a long single generation
(agentic loop, >5-min turn) is safe.

***

### onRun

```ts
onRun: (ctx) => AsyncIterable<AGUIEvent>;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L92)

Build a fresh chat() stream for each inbound RunAgentInput frame.

#### Parameters

##### ctx

[`WsRunContext`](WsRunContext.md)

#### Returns

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>
