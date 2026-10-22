---
id: ChatResult
title: ChatResult
---

Defined in: packages/ai/src/stream-to-response.ts:33

The result of a run that was read to the end, such as `chat({ stream: false })`.

## Properties

### chunks

```ts
chunks: AGUIEvent[];
```

Defined in: packages/ai/src/stream-to-response.ts:37

Every chunk the run produced, in order.

***

### text

```ts
text: string;
```

Defined in: packages/ai/src/stream-to-response.ts:35

Concatenated TEXT_MESSAGE_CONTENT deltas.
