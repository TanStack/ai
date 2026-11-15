---
id: PromptCacheOptions
title: PromptCacheOptions
---

```ts
type PromptCacheOptions = 
  | PromptCacheRetention
  | {
  key?: string;
  retention?: PromptCacheRetention;
};
```

Defined in: [packages/ai/src/types.ts:1327](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1327)

The `promptCache` option of `chat()`: a retention, or an object with a
retention and a cache key.
