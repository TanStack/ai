---
id: ChatResumeGenericResolution
title: ChatResumeGenericResolution
---

```ts
type ChatResumeGenericResolution = 
  | {
  interruptId: string;
  payload: unknown;
  status: "resolved";
}
  | {
  interruptId: string;
  payload?: never;
  status: "cancelled";
};
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:400
