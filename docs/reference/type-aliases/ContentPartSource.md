---
id: ContentPartSource
title: ContentPartSource
---

```ts
type ContentPartSource = 
  | ContentPartDataSource
  | ContentPartUrlSource
  | ContentPartFileSource;
```

Defined in: [packages/ai/src/types.ts:278](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L278)

Where a media part's bytes come from: inline data, a URL, or a provider
file handle. Same members as AG-UI `PartSource`.
