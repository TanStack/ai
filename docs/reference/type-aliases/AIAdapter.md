---
id: AIAdapter
title: AIAdapter
---

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
  | AnyRerankAdapter
  | AnyWorldAdapter
  | AnyLiveVideoAdapter;
```

Defined in: [packages/ai/src/activities/index.ts:258](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/index.ts#L258)

Union of all adapter types that can be passed to chat()
