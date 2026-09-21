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
  | AnyVoiceAdapter
  | AnyTranscriptionAdapter
  | AnyEmbeddingAdapter
  | AnyRerankAdapter
  | AnyEvaluateAdapter
  | AnyWorldAdapter
  | AnyLiveVideoAdapter;
```

Defined in: [packages/ai/src/activities/index.ts:323](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/index.ts#L323)

Union of all adapter types that can be passed to chat()
