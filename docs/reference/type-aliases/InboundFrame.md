---
id: InboundFrame
title: InboundFrame
---

# Type Alias: InboundFrame

```ts
type InboundFrame = 
  | {
  input: unknown;
  kind: "run";
}
  | {
  kind: "abort";
  runId: string;
};
```

Defined in: [packages/ai/src/stream-to-websocket.ts:24](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-websocket.ts#L24)

One inbound WS text frame, after JSON parse + shape discrimination.
