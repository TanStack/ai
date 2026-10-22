---
id: WsRunContext
title: WsRunContext
---

Defined in: packages/ai/src/stream-to-websocket.ts:62

Per-turn context for one inbound `run` frame on a conversation-scoped socket.

## Properties

### forwardedProps?

```ts
optional forwardedProps?: Record<string, unknown>;
```

Defined in: packages/ai/src/stream-to-websocket.ts:66

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

Defined in: packages/ai/src/stream-to-websocket.ts:63

***

### request

```ts
request: Request;
```

Defined in: packages/ai/src/stream-to-websocket.ts:68

Synthetic per-turn request carrying `?runId=` so durability keys correctly.

***

### runId

```ts
runId: string;
```

Defined in: packages/ai/src/stream-to-websocket.ts:65

***

### signal

```ts
signal: AbortSignal;
```

Defined in: packages/ai/src/stream-to-websocket.ts:70

Aborts on socket close or an `abort` control frame for this run.

***

### threadId

```ts
threadId: string;
```

Defined in: packages/ai/src/stream-to-websocket.ts:64
