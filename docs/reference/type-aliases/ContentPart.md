---
id: ContentPart
title: ContentPart
---

# Type Alias: ContentPart\<TTextMeta, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta\>

```ts
type ContentPart<TTextMeta, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta> = 
  | TextPart<TTextMeta>
  | ImagePart<TImageMeta>
  | AudioPart<TAudioMeta>
  | VideoPart<TVideoMeta>
| DocumentPart<TDocumentMeta>;
```

Defined in: [types.ts:212](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L212)

Union type for all multimodal content parts.

## Type Parameters

### TTextMeta

`TTextMeta` = `unknown`

### TImageMeta

`TImageMeta` = `unknown`

Provider-specific image metadata type

### TAudioMeta

`TAudioMeta` = `unknown`

Provider-specific audio metadata type

### TVideoMeta

`TVideoMeta` = `unknown`

Provider-specific video metadata type

### TDocumentMeta

`TDocumentMeta` = `unknown`

Provider-specific document metadata type
