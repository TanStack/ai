---
id: ContentPartForAdapter
title: ContentPartForAdapter
---

# Type Alias: ContentPartForAdapter\<TModalities, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta\>

```ts
type ContentPartForAdapter<TModalities, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta> = Extract<ContentPart<TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta>, {
  type: TModalities;
}>;
```

Defined in: [types.ts:176](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L176)

Helper type to filter ContentPart union to only include specific modalities.
Used to constrain message content based on model capabilities.

## Type Parameters

### TModalities

`TModalities` *extends* [`Modality`](Modality.md)

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
