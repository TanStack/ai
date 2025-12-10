---
id: ConstrainedContent
title: ConstrainedContent
---

# Type Alias: ConstrainedContent\<TModalities, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta\>

```ts
type ConstrainedContent<TModalities, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta> = 
  | string
  | null
  | ContentPartForModalities<ModalitiesArrayToUnion<TModalities>, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta>[];
```

Defined in: [types.ts:199](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L199)

Type for message content constrained by supported modalities.
When modalities is ['text', 'image'], only TextPart and ImagePart are allowed in the array.

## Type Parameters

### TModalities

`TModalities` *extends* `ReadonlyArray`\<[`Modality`](Modality.md)\>

### TImageMeta

`TImageMeta` = `unknown`

### TAudioMeta

`TAudioMeta` = `unknown`

### TVideoMeta

`TVideoMeta` = `unknown`

### TDocumentMeta

`TDocumentMeta` = `unknown`

### TTextMeta

`TTextMeta` = `unknown`
