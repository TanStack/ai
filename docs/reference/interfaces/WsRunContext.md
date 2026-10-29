---
id: WsRunContext
title: WsRunContext
---

Defined in: [packages/ai/src/stream-to-websocket.ts:68](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L68)

Per-turn context for one inbound `run` frame on a conversation-scoped socket.

## Properties

### forwardedProps?

```ts
optional forwardedProps?: Record<string, unknown>;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L72)

***

### messages

```ts
messages: (
  | UIMessage<unknown>
  | ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>)[];
```

Defined in: [packages/ai/src/stream-to-websocket.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L69)

***

### request

```ts
request: Request;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L74)

Synthetic per-turn request carrying `?runId=` so durability keys correctly.

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L71)

***

### signal

```ts
signal: AbortSignal;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:76](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L76)

Aborts on socket close or an `abort` control frame for this run.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L70)
