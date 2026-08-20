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
  | AnyTranscriptionAdapter
  | AnyEmbeddingAdapter
  | AnyRerankAdapter;
```

Defined in: [packages/ai/src/activities/index.ts:218](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/index.ts#L218)

Union of all adapter types that can be passed to chat()
