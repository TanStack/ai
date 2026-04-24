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

Defined in: [packages/typescript/ai/src/activities/index.ts:169](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/index.ts#L169)

Union of all adapter types that can be passed to chat()
