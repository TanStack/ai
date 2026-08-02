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

Defined in: [packages/ai/src/activities/index.ts:178](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/index.ts#L178)

Union of all adapter types that can be passed to chat()
