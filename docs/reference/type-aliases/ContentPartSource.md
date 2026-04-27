---
id: ContentPartSource
title: ContentPartSource
---

# Type Alias: ContentPartSource

```ts
type ContentPartSource = 
  | ContentPartDataSource
  | ContentPartUrlSource;
```

Defined in: [packages/typescript/ai/src/types.ts:184](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L184)

Source specification for multimodal content.
Discriminated union supporting both inline data (base64) and URL-based content.
- For 'data' sources: mimeType is required
- For 'url' sources: mimeType is optional
