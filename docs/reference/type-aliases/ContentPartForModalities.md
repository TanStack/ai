---
id: ContentPartForModalities
title: ContentPartForModalities
---

# Type Alias: ContentPartForModalities\<TModalities, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta\>

```ts
type ContentPartForModalities<TModalities, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta> = Extract<ContentPart<TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta>, {
  type: TModalities;
}>;
```

Defined in: [types.ts:118](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L118)

Helper type to filter ContentPart union to only include specific modalities.
Used to constrain message content based on model capabilities.

## Type Parameters

### TModalities

`TModalities` *extends* [`Modality`](./Modality.md)

### TImageMeta

`TImageMeta` = `unknown`

### TAudioMeta

`TAudioMeta` = `unknown`

### TVideoMeta

`TVideoMeta` = `unknown`

### TDocumentMeta

`TDocumentMeta` = `unknown`
