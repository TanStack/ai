---
id: AIAdapter
title: AIAdapter
---

# Type Alias: AIAdapter

```ts
type AIAdapter = 
  | AnyTextAdapter
  | AnySummarizeAdapter
  | AnyImageAdapter
  | AnyVideoAdapter
  | AnyTTSAdapter
  | AnyTranscriptionAdapter;
```

Defined in: [activities/index.ts:149](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/index.ts#L149)

Union of all adapter types that can be passed to chat()
