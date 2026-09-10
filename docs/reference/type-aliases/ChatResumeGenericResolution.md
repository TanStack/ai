---
id: ChatResumeGenericResolution
title: ChatResumeGenericResolution
---

# Type Alias: ChatResumeGenericResolution

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:348](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L348)
