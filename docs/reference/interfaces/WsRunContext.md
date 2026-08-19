---
id: WsRunContext
title: WsRunContext
---

# Interface: WsRunContext

Defined in: [packages/ai/src/stream-to-websocket.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L60)

Per-turn context for one inbound `run` frame on a conversation-scoped socket.

## Properties

### forwardedProps?

```ts
optional forwardedProps?: Record<string, unknown>;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L64)

***

### messages

```ts
messages: (
  | ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>
  | UIMessage<unknown>)[];
```

Defined in: [packages/ai/src/stream-to-websocket.ts:61](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L61)

***

### request

```ts
request: Request;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L66)

Synthetic per-turn request carrying `?runId=` so durability keys correctly.

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L63)

***

### signal

```ts
signal: AbortSignal;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:68](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L68)

Aborts on socket close or an `abort` control frame for this run.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/stream-to-websocket.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L62)
