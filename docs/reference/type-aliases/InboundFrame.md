---
id: InboundFrame
title: InboundFrame
---

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

Defined in: packages/ai/src/stream-to-websocket.ts:25

One inbound WS text frame, after JSON parse + shape discrimination.
