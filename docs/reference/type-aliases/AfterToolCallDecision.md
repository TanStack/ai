---
id: AfterToolCallDecision
title: AfterToolCallDecision
---

```ts
type AfterToolCallDecision = 
  | void
  | {
  result: unknown;
  type: "replaceResult";
};
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:490

Decision returned from onAfterToolCall.
- undefined/void: keep the current result
- { type: 'replaceResult', result }: use this result instead. The model and
  the stream see it. The next middleware gets it as `info.result`. An error
  result stays an error.
