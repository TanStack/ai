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
  | AnyAudioAdapter
  | AnyVideoAdapter
  | AnyTTSAdapter
  | AnyTranscriptionAdapter;
```

Defined in: [packages/typescript/ai/src/activities/index.ts:174](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/index.ts#L174)

Union of all adapter types that can be passed to chat()
